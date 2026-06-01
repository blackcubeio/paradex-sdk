import type { ParadexClient } from '../common/config';
import type { MarketKind, Order } from '../common/types';
import { OrderConverter, type OrderNative, TYPE_TO_NATIVE } from '../converters/order';
import { authHeaders } from './auth';
import { httpPost, resolveSigner } from './client';
import {
  chainIdFromStarknetChainId,
  getSystemConfig,
  serializeSignature,
  signOrder,
} from './signing';

/** Type d'ordre unifié → besoin de prix / trigger. */
const ORDER_SPEC: Record<
  Order['type'] | 'limit' | 'market',
  { trigger: boolean; market: boolean }
> = {
  limit: { trigger: false, market: false },
  market: { trigger: false, market: true },
  stop: { trigger: true, market: false },
  stopMarket: { trigger: true, market: true },
  takeProfit: { trigger: true, market: false },
  takeProfitMarket: { trigger: true, market: true },
  trailingStop: { trigger: true, market: true },
  other: { trigger: false, market: false },
};

/** Instruction (TIF) unifiée → native Paradex. */
const TIF_TO_NATIVE: Record<NonNullable<PlaceArgs['tif']>, string> = {
  gtc: 'GTC',
  ioc: 'IOC',
  fok: 'IOC', // Paradex n'expose pas FOK distinct : IOC est l'équivalent le plus proche.
  alo: 'POST_ONLY',
};

/** Entrée résolue de placement (le `kind` est porté par le scope). */
export interface PlaceArgs {
  name: string;
  side: 'buy' | 'sell';
  type: Order['type'];
  size: string;
  price?: string;
  triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo';
  reduceOnly?: boolean;
  clientId?: string;
  kind: MarketKind;
}

/**
 * Place un ordre signé (`POST /orders`). Signe le message SNIP-12 `Order` (timestamp = nonce ms),
 * envoie `signature` (`"[r,s]"`) + `signature_timestamp`. Renvoie l'{@link Order} unifié (la réponse
 * Paradex contient l'ordre créé).
 *
 * **Validé testnet (2026-06-01)** : `POST /orders` accepte la signature `Order` (`201`, statut
 * `NEW`, id renvoyé). Cf. `tests/trading.testnet.test.ts`.
 */
export async function placeOrder(
  client: ParadexClient,
  label: string | undefined,
  input: PlaceArgs,
): Promise<Order> {
  const { signer } = resolveSigner(client, label);
  const spec = ORDER_SPEC[input.type];
  if (!spec.market && input.price === undefined) {
    throw new Error('place (Paradex) : `price` est requis pour un ordre limite.');
  }
  if (spec.trigger && input.triggerPrice === undefined) {
    throw new Error(`place (Paradex) : \`triggerPrice\` est requis pour un ordre "${input.type}".`);
  }
  const config = await getSystemConfig(client, signer.network);
  const chainId = chainIdFromStarknetChainId(config.starknet_chain_id);
  const timestamp = Date.now();
  const sideNative = input.side === 'sell' ? 'SELL' : 'BUY';
  const orderType = TYPE_TO_NATIVE[input.type];
  // À la signature, le prix d'un MARKET est `0` (cf. API-RESEARCH).
  const signedPrice = spec.market ? '0' : (input.price ?? '0');
  const signature = signOrder(signer, chainId, {
    timestamp,
    market: input.name,
    side: sideNative,
    orderType,
    size: input.size,
    price: signedPrice,
  });

  const flags: string[] = [];
  if (input.reduceOnly === true) {
    flags.push('REDUCE_ONLY');
  }
  const body: Record<string, unknown> = {
    market: input.name,
    side: sideNative,
    type: orderType,
    size: input.size,
    signature: serializeSignature(signature),
    signature_timestamp: timestamp,
  };
  if (!spec.market && input.price !== undefined) {
    body.price = input.price;
  }
  if (spec.trigger && input.triggerPrice !== undefined) {
    body.trigger_price = input.triggerPrice;
  }
  if (input.tif !== undefined && !spec.market) {
    body.instruction = TIF_TO_NATIVE[input.tif];
  }
  if (flags.length > 0) {
    body.flags = flags;
  }
  if (input.clientId !== undefined) {
    body.client_id = input.clientId;
  }

  const headers = await authHeaders(client, label);
  const native = await httpPost<OrderNative>(client, signer.network, '/orders', body, headers);
  return new OrderConverter(input.kind).toCommon(native);
}
