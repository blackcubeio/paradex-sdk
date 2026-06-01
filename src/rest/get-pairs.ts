import type { ParadexClient } from '../common/config';
import type { MarketKind, Pair } from '../common/types';
import { type MarketNative, PairConverter } from '../converters/pair';
import { httpGet } from './client';

/** Enveloppe `{ results: [...] }` commune aux listes Paradex. */
interface Results<T> {
  results?: T[];
}

/** Tous les marchés natifs (`GET /markets`). Utilisé par la façade pour le cache de métadonnées. */
export function fetchMarkets(client: ParadexClient, label?: string): Promise<MarketNative[]> {
  return httpGet<Results<MarketNative>>(client, '/markets', undefined, label).then(
    (env) => env.results ?? [],
  );
}

/** Paires au **format unifié**, filtrées par `kind` (perp/spot). */
export async function getPairs(
  client: ParadexClient,
  label: string | undefined,
  kind: MarketKind,
): Promise<Pair[]> {
  const markets = await fetchMarkets(client, label);
  const converter = new PairConverter();
  return markets.map((m) => converter.toCommon(m)).filter((p) => p.kind === kind);
}
