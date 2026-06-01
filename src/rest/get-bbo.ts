import type { ParadexClient } from '../common/config';
import type { MarketKind, OrderBook } from '../common/types';
import type { BboNative } from '../converters/price';
import { httpGet } from './client';

/**
 * Meilleure limite (BBO) au **format {@link OrderBook}** à un seul niveau (`GET /bbo/{market}`).
 * Réutilise la forme carnet (bids/asks à 1 niveau) pour rester homogène avec `subscribeBbo`.
 */
export async function getBbo(
  client: ParadexClient,
  params: { name: string; kind: MarketKind },
  label?: string,
): Promise<OrderBook> {
  const native = await httpGet<BboNative>(
    client,
    `/bbo/${encodeURIComponent(params.name)}`,
    undefined,
    label,
  );
  return {
    name: params.name,
    kind: params.kind,
    bids:
      native.bid !== undefined
        ? [{ price: native.bid, size: native.bid_size ?? '0', n: null }]
        : [],
    asks:
      native.ask !== undefined
        ? [{ price: native.ask, size: native.ask_size ?? '0', n: null }]
        : [],
    time: native.last_updated_at ?? null,
    xtras: native.seq_no !== undefined ? { seq_no: native.seq_no } : undefined,
  };
}
