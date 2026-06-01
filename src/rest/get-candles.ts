import type { ParadexClient } from '../common/config';
import type { Candle, MarketKind } from '../common/types';
import { CandleConverter, type KlineNative } from '../converters/candle';
import { httpGet } from './client';

/** Paramètres résolus de lecture de bougies (temps en ms epoch). */
export interface GetCandlesParams {
  name: string;
  interval: string;
  resolution: number;
  intervalMs: number;
  startTime: number;
  endTime: number;
  priceKind?: string;
  kind: MarketKind;
}

/** Enveloppe klines (`{ results: [...] }`, ordre des colonnes à confirmer testnet). */
interface KlinesEnvelope {
  results?: KlineNative[];
}

/**
 * Bougies au **format unifié** (`GET /markets/klines`). `resolution` est en minutes (1,3,5,15,30,60).
 * `start_at`/`end_at` sont **requis** côté Paradex (ms epoch).
 */
export async function getCandles(
  client: ParadexClient,
  params: GetCandlesParams,
  label?: string,
): Promise<Candle[]> {
  const env = await httpGet<KlinesEnvelope>(
    client,
    '/markets/klines',
    {
      symbol: params.name,
      resolution: params.resolution,
      start_at: params.startTime,
      end_at: params.endTime,
      price_kind: params.priceKind,
    },
    label,
  );
  const converter = new CandleConverter(
    params.name,
    params.interval,
    params.kind,
    params.intervalMs,
  );
  return (env.results ?? []).map((row) => converter.toCommon(row));
}
