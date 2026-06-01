import type { MarketKind, Price } from '../common/types';

/** Résumé de marché natif (`GET /markets/summary`). */
export interface MarketSummaryNative {
  symbol: string;
  mark_price?: string;
  last_traded_price?: string;
  underlying_price?: string;
  bid?: string;
  ask?: string;
  funding_rate?: string;
  open_interest?: string;
  volume_24h?: string;
  price_change_rate_24h?: string;
  created_at?: number;
  [key: string]: unknown;
}

/** BBO natif (`GET /bbo/{market}`). */
export interface BboNative {
  market?: string;
  bid?: string;
  bid_size?: string;
  ask?: string;
  ask_size?: string;
  seq_no?: number;
  last_updated_at?: number;
  [key: string]: unknown;
}

const SUMMARY_CORE: ReadonlySet<string> = new Set([
  'symbol',
  'mark_price',
  'last_traded_price',
  'underlying_price',
  'bid',
  'ask',
  'funding_rate',
  'open_interest',
  'volume_24h',
  'created_at',
]);

const s = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

/**
 * Convertisseur **bijectif** prix : depuis `markets/summary`. `oracle` = `underlying_price`,
 * `mid`/`prevDayPrice` non fournis directement (→ `null`). Le surplus va dans `xtras`.
 */
export class PriceConverter {
  constructor(private readonly kind: MarketKind) {}

  toCommon(native: MarketSummaryNative): Price {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!SUMMARY_CORE.has(k)) {
        xtras[k] = v;
      }
    }
    const price: Price = {
      name: native.symbol,
      kind: this.kind,
      mark: s(native.mark_price),
      oracle: s(native.underlying_price),
      mid: null,
      bid: s(native.bid),
      ask: s(native.ask),
      last: s(native.last_traded_price),
      funding: s(native.funding_rate),
      openInterest: s(native.open_interest),
      volume24h: s(native.volume_24h),
      prevDayPrice: null,
      time: native.created_at ?? null,
    };
    if (Object.keys(xtras).length > 0) {
      price.xtras = xtras;
    }
    return price;
  }

  toNative(price: Price): MarketSummaryNative {
    const xtras = (price.xtras ?? {}) as Record<string, unknown>;
    const native: MarketSummaryNative = { ...xtras, symbol: price.name };
    if (price.mark !== null) {
      native.mark_price = price.mark;
    }
    if (price.oracle !== null) {
      native.underlying_price = price.oracle;
    }
    if (price.bid !== null) {
      native.bid = price.bid;
    }
    if (price.ask !== null) {
      native.ask = price.ask;
    }
    if (price.last !== null) {
      native.last_traded_price = price.last;
    }
    if (price.funding !== null) {
      native.funding_rate = price.funding;
    }
    if (price.openInterest !== null) {
      native.open_interest = price.openInterest;
    }
    if (price.volume24h !== null) {
      native.volume_24h = price.volume24h;
    }
    if (price.time !== null) {
      native.created_at = price.time;
    }
    return native;
  }
}
