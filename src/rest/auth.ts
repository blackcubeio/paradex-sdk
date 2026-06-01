import type { ParadexClient } from '../common/config';
import { type Headers, httpPost, resolveSigner } from './client';
import {
  chainIdFromStarknetChainId,
  getSystemConfig,
  serializeSignature,
  signAuth,
  signOnboarding,
} from './signing';

/** Durée de vie par défaut du JWT (30 min) ; le serveur plafonne à ~1 semaine. */
const DEFAULT_EXPIRATION_S = 30 * 60;

/** Marge de renouvellement : on resigne un JWT s'il expire dans moins de 60 s. */
const REFRESH_MARGIN_S = 60;

/** Entrée du cache JWT : token + échéance (s epoch). */
interface JwtEntry {
  token: string;
  expiresAt: number;
}

/** Cache JWT par label de signer (in-process, le temps de vie d'un client). */
const jwtCache = new Map<string, JwtEntry>();

/**
 * **Onboarding** : enregistre le compte Starknet auprès de Paradex (`POST /onboarding`).
 * Idempotent côté serveur. Headers `PARADEX-STARKNET-ACCOUNT` + `PARADEX-STARKNET-SIGNATURE`,
 * body `{ public_key }`. ⚠️ signature SNIP-12 **à valider testnet**.
 */
export async function onboard(client: ParadexClient, label?: string): Promise<void> {
  const { signer } = resolveSigner(client, label);
  const config = await getSystemConfig(client, signer.network);
  const chainId = chainIdFromStarknetChainId(config.starknet_chain_id);
  const signature = signOnboarding(signer, chainId);
  const headers: Headers = {
    'PARADEX-STARKNET-ACCOUNT': signer.l2Address,
    'PARADEX-STARKNET-SIGNATURE': serializeSignature(signature),
  };
  await httpPost<Record<string, never>>(
    client,
    signer.network,
    '/onboarding',
    { public_key: signer.l2Address },
    headers,
  );
}

/**
 * Produit (ou réutilise depuis le cache) un **JWT** Paradex. `POST /auth` avec la signature SNIP-12
 * du message `Request`. Headers `PARADEX-STARKNET-ACCOUNT`, `PARADEX-STARKNET-SIGNATURE`,
 * `PARADEX-TIMESTAMP`, `PARADEX-SIGNATURE-EXPIRATION`. Renvoie le `jwt_token`.
 *
 * ⚠️ Le flux complet (onboarding + signature) reste **à valider testnet**.
 */
export async function getJwt(
  client: ParadexClient,
  label?: string,
  expirationSeconds = DEFAULT_EXPIRATION_S,
): Promise<string> {
  const { label: key, signer } = resolveSigner(client, label);
  const now = Math.floor(Date.now() / 1000);
  const cached = jwtCache.get(key);
  if (cached !== undefined && cached.expiresAt - REFRESH_MARGIN_S > now) {
    return cached.token;
  }
  const config = await getSystemConfig(client, signer.network);
  const chainId = chainIdFromStarknetChainId(config.starknet_chain_id);
  const timestamp = now;
  const expiration = now + expirationSeconds;
  const signature = signAuth(signer, chainId, timestamp, expiration);
  const headers: Headers = {
    'PARADEX-STARKNET-ACCOUNT': signer.l2Address,
    'PARADEX-STARKNET-SIGNATURE': serializeSignature(signature),
    'PARADEX-TIMESTAMP': String(timestamp),
    'PARADEX-SIGNATURE-EXPIRATION': String(expiration),
  };
  const response = await httpPost<{ jwt_token: string }>(
    client,
    signer.network,
    '/auth',
    undefined,
    headers,
  );
  const token = response.jwt_token;
  jwtCache.set(key, { token, expiresAt: expiration });
  return token;
}

/** En-tête `Authorization: Bearer <jwt>` pour les endpoints privés. */
export async function authHeaders(client: ParadexClient, label?: string): Promise<Headers> {
  const jwt = await getJwt(client, label);
  return { Authorization: `Bearer ${jwt}` };
}

/** Vide le cache JWT d'un label (ou de tout). Utile en test / rotation de clé. */
export function clearJwtCache(label?: string): void {
  if (label === undefined) {
    jwtCache.clear();
  } else {
    jwtCache.delete(label);
  }
}
