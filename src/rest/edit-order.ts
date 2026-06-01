import type { ParadexClient } from '../common/config';
import { authHeaders } from './auth';
import { httpPut, resolveSigner } from './client';
import {
  chainIdFromStarknetChainId,
  getSystemConfig,
  serializeSignature,
  signModifyOrder,
} from './signing';

/** Entrée résolue de modification (resignée en SNIP-12 `ModifyOrder`). */
export interface EditArgs {
  id: string;
  name: string;
  side: 'buy' | 'sell';
  size: string;
  price?: string;
  orderType: string;
}

/**
 * Modifie un ordre (`PUT /orders/{id}`). Resigne le message `ModifyOrder` (= `Order` + `id`).
 * Renvoie l'identité `{ name, id }` (le snapshot complet doit être relu via `getOpens`).
 *
 * ⚠️ Signature Stark **à valider testnet**.
 */
export async function editOrder(
  client: ParadexClient,
  label: string | undefined,
  input: EditArgs,
): Promise<{ name: string; id: string }> {
  const { signer } = resolveSigner(client, label);
  if (input.price === undefined) {
    throw new Error('edit (Paradex) : `price` est requis.');
  }
  const config = await getSystemConfig(client, signer.network);
  const chainId = chainIdFromStarknetChainId(config.starknet_chain_id);
  const timestamp = Date.now();
  const sideNative = input.side === 'sell' ? 'SELL' : 'BUY';
  const signature = signModifyOrder(signer, chainId, {
    timestamp,
    market: input.name,
    side: sideNative,
    orderType: input.orderType,
    size: input.size,
    price: input.price,
    id: input.id,
  });
  const headers = await authHeaders(client, label);
  await httpPut(
    client,
    signer.network,
    `/orders/${encodeURIComponent(input.id)}`,
    {
      id: input.id,
      market: input.name,
      side: sideNative,
      type: input.orderType,
      size: input.size,
      price: input.price,
      signature: serializeSignature(signature),
      signature_timestamp: timestamp,
    },
    headers,
  );
  return { name: input.name, id: input.id };
}
