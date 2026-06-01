import type { ParadexClient } from '../common/config';
import type { Trade } from '../common/types';
import { TradeConverter, type TradeNative } from '../converters/trade';
import { httpGet } from './client';

interface Results<T> {
  results?: T[];
}

/** Trades publics au **format unifié** (`GET /trades?market=`). `limit` → `page_size` (max 1000). */
export async function getTrades(
  client: ParadexClient,
  params: { name: string; limit?: number },
  label?: string,
): Promise<Trade[]> {
  const env = await httpGet<Results<TradeNative>>(
    client,
    '/trades',
    { market: params.name, page_size: params.limit },
    label,
  );
  const converter = new TradeConverter();
  return (env.results ?? []).map((t) => converter.toCommon(t));
}
