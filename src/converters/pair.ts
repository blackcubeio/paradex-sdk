import type { MarketKind, Pair } from '../common/types';

/**
 * Marché natif Paradex (`GET /markets`). Champs principaux d'après `doc/API-RESEARCH.md` ; le reste
 * est conservé dans `xtras` (rien jeté). Formes exactes **à confirmer testnet**.
 */
export interface MarketNative {
  symbol: string;
  base_currency?: string;
  quote_currency?: string;
  settlement_currency?: string;
  asset_kind?: string;
  order_size_increment?: string;
  price_tick_size?: string;
  min_notional?: string;
  max_open_orders?: number;
  max_funding_rate?: string;
  position_limit?: string;
  [key: string]: unknown;
}

const CORE_KEYS: ReadonlySet<string> = new Set([
  'symbol',
  'base_currency',
  'quote_currency',
  'asset_kind',
  'order_size_increment',
  'price_tick_size',
  'min_notional',
]);

/** Pas de quantité → décimales (`step = 10^-n`). */
function decimalsFromStep(step: string | undefined): number {
  if (step === undefined) {
    return 0;
  }
  const [, frac = ''] = step.split('.');
  return frac.replace(/0+$/, '').length;
}

/**
 * Convertisseur **bijectif** paire : `toCommon(native) → Pair` / `toNative(pair) → native`. Le
 * `kind` est déduit du `symbol` (`-PERP` → perp, sinon spot) recoupé avec `asset_kind`. Tout le
 * surplus natif va dans `xtras` → `toNative(toCommon(x)) ≡ x`.
 */
export class PairConverter {
  toCommon(native: MarketNative): Pair {
    const kind: MarketKind = native.symbol.endsWith('-PERP') ? 'perp' : 'spot';
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE_KEYS.has(k)) {
        xtras[k] = v;
      }
    }
    const pair: Pair = {
      name: native.symbol,
      base: native.base_currency ?? native.symbol.split('-')[0] ?? native.symbol,
      quote: native.quote_currency ?? 'USD',
      kind,
      szDecimals: decimalsFromStep(native.order_size_increment),
      tickSize: native.price_tick_size,
      stepSize: native.order_size_increment,
      minNotional: native.min_notional,
      status: 'TRADING',
    };
    if (Object.keys(xtras).length > 0) {
      pair.xtras = xtras;
    }
    return pair;
  }

  toNative(pair: Pair): MarketNative {
    const xtras = (pair.xtras ?? {}) as Record<string, unknown>;
    return {
      ...xtras,
      symbol: pair.name,
      base_currency: pair.base,
      quote_currency: pair.quote,
      asset_kind:
        (xtras.asset_kind as string | undefined) ?? (pair.kind === 'perp' ? 'PERP' : 'SPOT'),
      order_size_increment: pair.stepSize,
      price_tick_size: pair.tickSize,
      min_notional: pair.minNotional,
    };
  }
}
