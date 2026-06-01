import type { ParadexClient } from '../common/config';
import type { FundingRate } from '../common/types';
import { FundingConverter, type FundingDataNative } from '../converters/funding';
import { httpGet } from './client';

interface Results<T> {
  results?: T[];
}

/** Paramètres résolus de l'historique de funding (temps en ms epoch). */
export interface GetFundingHistoryParams {
  name: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/** Historique de funding au **format unifié** (`GET /funding/data?market=`). */
export async function getFundingHistory(
  client: ParadexClient,
  params: GetFundingHistoryParams,
  label?: string,
): Promise<FundingRate[]> {
  const env = await httpGet<Results<FundingDataNative>>(
    client,
    '/funding/data',
    {
      market: params.name,
      start_at: params.startTime,
      end_at: params.endTime,
      page_size: params.limit,
    },
    label,
  );
  const converter = new FundingConverter(params.name);
  return (env.results ?? []).map((f) => converter.toCommon(f));
}
