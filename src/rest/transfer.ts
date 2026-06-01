import type { ParadexClient } from '../common/config';
import type { AckNative } from '../converters/ack';
import { authHeaders } from './auth';
import { httpPost, resolveSigner } from './client';

/**
 * Transfert de collatéral vers un **sous-compte** (`POST /transfers`). Authentifié par JWT.
 * Narrowing assumé : Paradex ne transfère que du collatéral USDC entre comptes/sous-comptes.
 *
 * ⚠️ Le schéma exact du body de transfert/retrait reste **à confirmer testnet** (certaines routes
 * exigent une signature SNIP-12 dédiée selon la version d'API).
 */
export async function transfer(
  client: ParadexClient,
  label: string | undefined,
  params: { subAccount: string; amount: string; asset?: string },
): Promise<AckNative | null> {
  const { signer } = resolveSigner(client, label);
  const headers = await authHeaders(client, label);
  return httpPost<AckNative | null>(
    client,
    signer.network,
    '/transfers',
    {
      recipient: params.subAccount,
      amount: params.amount,
      token: params.asset ?? 'USDC',
    },
    headers,
  );
}

/**
 * Retrait de collatéral (`POST /transfers` avec destination L1, ou route dédiée selon l'API).
 * Body laissé extensible (champs additionnels passés tels quels). ⚠️ **à confirmer testnet**.
 */
export async function withdraw(
  client: ParadexClient,
  label: string | undefined,
  params: { amount: string; address?: string; asset?: string; extra?: Record<string, unknown> },
): Promise<AckNative | null> {
  const { signer } = resolveSigner(client, label);
  const headers = await authHeaders(client, label);
  return httpPost<AckNative | null>(
    client,
    signer.network,
    '/transfers',
    {
      ...(params.extra ?? {}),
      kind: 'WITHDRAWAL',
      amount: params.amount,
      token: params.asset ?? 'USDC',
      recipient: params.address,
    },
    headers,
  );
}
