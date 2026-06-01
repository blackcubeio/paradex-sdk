import type { ParadexClient } from '../common/config';
import { authHeaders } from './auth';
import { httpDelete, resolveSigner } from './client';

/**
 * Annule un ordre (`DELETE /orders/{id}` ou `DELETE /orders/by-client-id/{client_id}`). L'annulation
 * Paradex est authentifiée par JWT — **pas de signature SNIP-12** distincte (confirmé testnet
 * 2026-06-01 : `DELETE /orders/{id}` n'exige que le Bearer JWT).
 */
export async function cancelOrder(
  client: ParadexClient,
  label: string | undefined,
  params: { id?: string; clientId?: string },
): Promise<void> {
  const { signer } = resolveSigner(client, label);
  const headers = await authHeaders(client, label);
  const path =
    params.id !== undefined
      ? `/orders/${encodeURIComponent(params.id)}`
      : `/orders/by-client-id/${encodeURIComponent(params.clientId ?? '')}`;
  await httpDelete(client, signer.network, path, undefined, headers);
}
