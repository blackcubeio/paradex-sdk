import type { Side, Trade } from '../common/types';

/** Trade public natif Paradex (`GET /trades`). `side` = côté du **taker**. */
export interface TradeNative {
  id?: string;
  market?: string;
  price?: string;
  size?: string;
  side?: string;
  created_at?: number;
  trade_type?: string;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set(['id', 'price', 'size', 'side', 'created_at']);

/** Côté natif (`BUY`/`SELL`) → côté unifié. */
function toSide(side: string | undefined): Side | null {
  if (side === undefined) {
    return null;
  }
  const u = side.toUpperCase();
  return u === 'BUY' ? 'buy' : u === 'SELL' ? 'sell' : null;
}

/**
 * Convertisseur **bijectif** trade public. L'`id` Paradex est une chaîne (le type commun `Trade.id`
 * est `number | null`) → on conserve l'id natif dans `xtras` et on expose `id: null` quand il n'est
 * pas numérique. `maker` non fourni (side = taker) → `null`.
 */
export class TradeConverter {
  toCommon(native: TradeNative): Trade {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    if (native.id !== undefined) {
      xtras.id = native.id;
    }
    const numericId = native.id !== undefined && /^\d+$/.test(native.id) ? Number(native.id) : null;
    const trade: Trade = {
      price: String(native.price ?? '0'),
      size: String(native.size ?? '0'),
      side: toSide(native.side),
      maker: null,
      time: native.created_at ?? 0,
      id: numericId,
    };
    if (Object.keys(xtras).length > 0) {
      trade.xtras = xtras;
    }
    return trade;
  }

  toNative(trade: Trade): TradeNative {
    const xtras = (trade.xtras ?? {}) as Record<string, unknown>;
    return {
      ...xtras,
      id: (xtras.id as string | undefined) ?? (trade.id !== null ? String(trade.id) : undefined),
      price: trade.price,
      size: trade.size,
      side: trade.side === null ? undefined : trade.side.toUpperCase(),
      created_at: trade.time,
    };
  }
}
