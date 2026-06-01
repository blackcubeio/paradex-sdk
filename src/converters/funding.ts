import type { FundingRate } from '../common/types';

/** Point de funding natif Paradex (`GET /funding/data`). */
export interface FundingDataNative {
  market?: string;
  created_at?: number;
  funding_index?: string;
  funding_premium?: string;
  funding_rate?: string;
  funding_period_hours?: number;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set([
  'market',
  'created_at',
  'funding_rate',
  'funding_index',
  'funding_premium',
]);

/**
 * Convertisseur **bijectif** funding. Paradex publie `funding_index`/`funding_premium` ; le taux
 * unifié `fundingRate` prend `funding_rate` si présent, sinon `funding_premium`. Surplus en `xtras`.
 */
export class FundingConverter {
  constructor(private readonly name: string) {}

  toCommon(native: FundingDataNative): FundingRate {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    if (native.funding_index !== undefined) {
      xtras.funding_index = native.funding_index;
    }
    if (native.funding_premium !== undefined) {
      xtras.funding_premium = native.funding_premium;
    }
    const rate: FundingRate = {
      name: native.market ?? this.name,
      fundingRate: String(native.funding_rate ?? native.funding_premium ?? '0'),
      time: native.created_at ?? 0,
    };
    if (Object.keys(xtras).length > 0) {
      rate.xtras = xtras;
    }
    return rate;
  }

  toNative(rate: FundingRate): FundingDataNative {
    const xtras = (rate.xtras ?? {}) as Record<string, unknown>;
    return {
      ...xtras,
      market: rate.name,
      created_at: rate.time,
      funding_rate: rate.fundingRate,
    };
  }
}
