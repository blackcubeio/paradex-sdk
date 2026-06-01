import type { ParadexClient } from '../common/config';
import type { AckNative } from '../converters/ack';
import { authHeaders } from './auth';
import { httpPost, resolveSigner } from './client';

/**
 * Configure levier et/ou mode de marge d'un marché (`POST /account/margin/{market}`). Authentifié
 * par JWT. `margin_type` = `CROSS` | `ISOLATED`. Champs omis = inchangés côté serveur.
 */
export async function setAccountMargin(
  client: ParadexClient,
  label: string | undefined,
  params: { name: string; leverage?: number; marginType?: 'CROSS' | 'ISOLATED' },
): Promise<AckNative | null> {
  const { signer } = resolveSigner(client, label);
  const headers = await authHeaders(client, label);
  const body: Record<string, unknown> = {};
  if (params.leverage !== undefined) {
    body.leverage = params.leverage;
  }
  if (params.marginType !== undefined) {
    body.margin_type = params.marginType;
  }
  return httpPost<AckNative | null>(
    client,
    signer.network,
    `/account/margin/${encodeURIComponent(params.name)}`,
    body,
    headers,
  );
}
