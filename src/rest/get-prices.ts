import type { ParadexClient } from '../common/config';
import type { MarketKind, Price } from '../common/types';
import { type MarketSummaryNative, PriceConverter } from '../converters/price';
import { httpGet } from './client';

interface Results<T> {
  results?: T[];
}

/**
 * Prix au **format unifié** (`GET /markets/summary?market=ALL`). Le `kind` filtre le résultat
 * (perp/spot, déduit du symbole). `bid`/`ask` viennent du summary si présents.
 */
export async function getPrices(
  client: ParadexClient,
  label: string | undefined,
  kind: MarketKind,
): Promise<Price[]> {
  const env = await httpGet<Results<MarketSummaryNative>>(
    client,
    '/markets/summary',
    { market: 'ALL' },
    label,
  );
  const converter = new PriceConverter(kind);
  return (env.results ?? [])
    .filter((m) => (m.symbol.endsWith('-PERP') ? kind === 'perp' : kind === 'spot'))
    .map((m) => converter.toCommon(m));
}
