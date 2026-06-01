import type { ParadexClient } from '../common/config';
import { authHeaders } from './auth';
import { httpDelete, resolveSigner } from './client';

/**
 * Annule tous les ordres (`DELETE /orders?market=`). Si `market` est omis, annule sur tous les
 * marchés. Paradex ne renvoie pas de compteur d'annulations → `cancelled: null`.
 */
export async function cancelAllOrders(
  client: ParadexClient,
  label: string | undefined,
  market?: string,
): Promise<void> {
  const { signer } = resolveSigner(client, label);
  const headers = await authHeaders(client, label);
  await httpDelete(client, signer.network, '/orders', { market }, headers);
}
