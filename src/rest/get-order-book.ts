import type { ParadexClient } from '../common/config';
import type { MarketKind, OrderBook } from '../common/types';
import { OrderBookConverter, type OrderBookNative } from '../converters/order-book';
import { httpGet } from './client';

/** Carnet d'ordres au **format unifié** (`GET /orderbook/{market}`). `limit` → `depth`. */
export async function getOrderBook(
  client: ParadexClient,
  params: { name: string; limit?: number; kind: MarketKind },
  label?: string,
): Promise<OrderBook> {
  const native = await httpGet<OrderBookNative>(
    client,
    `/orderbook/${encodeURIComponent(params.name)}`,
    { depth: params.limit },
    label,
  );
  return new OrderBookConverter(params.name, params.kind).toCommon(native);
}
