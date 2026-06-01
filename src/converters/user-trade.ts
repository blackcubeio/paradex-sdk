import type { MarketKind, Side, UserTrade } from '../common/types';

/** Fill natif Paradex (`GET /fills`). */
export interface FillNative {
  id?: string;
  order_id?: string;
  market?: string;
  side?: string;
  price?: string;
  size?: string;
  fee?: string;
  fee_currency?: string;
  realized_pnl?: string;
  liquidity?: string;
  fill_type?: string;
  created_at?: number;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set([
  'id',
  'order_id',
  'market',
  'side',
  'price',
  'size',
  'fee',
  'fee_currency',
  'realized_pnl',
  'liquidity',
  'created_at',
]);

function toSide(side: string | undefined): Side {
  return String(side).toUpperCase() === 'SELL' ? 'sell' : 'buy';
}

/**
 * Convertisseur **bijectif** fill. `maker` dérivé de `liquidity` (`MAKER`/`TAKER`). Surplus `xtras`.
 */
export class UserTradeConverter {
  constructor(private readonly kind: MarketKind) {}

  toCommon(native: FillNative): UserTrade {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    if (native.liquidity !== undefined) {
      xtras.liquidity = native.liquidity;
    }
    const liq = String(native.liquidity ?? '').toUpperCase();
    const trade: UserTrade = {
      name: native.market ?? '',
      kind: this.kind,
      id: String(native.id ?? ''),
      orderId: String(native.order_id ?? ''),
      side: toSide(native.side),
      price: String(native.price ?? '0'),
      size: String(native.size ?? '0'),
      fee: String(native.fee ?? '0'),
      feeAsset: native.fee_currency ?? null,
      pnl: native.realized_pnl !== undefined ? String(native.realized_pnl) : null,
      maker: liq === 'MAKER' ? true : liq === 'TAKER' ? false : null,
      time: native.created_at ?? 0,
    };
    if (Object.keys(xtras).length > 0) {
      trade.xtras = xtras;
    }
    return trade;
  }

  toNative(trade: UserTrade): FillNative {
    const xtras = (trade.xtras ?? {}) as Record<string, unknown>;
    const native: FillNative = {
      ...xtras,
      id: trade.id,
      order_id: trade.orderId,
      market: trade.name,
      side: trade.side.toUpperCase(),
      price: trade.price,
      size: trade.size,
      fee: trade.fee,
      fee_currency: trade.feeAsset ?? undefined,
      created_at: trade.time,
    };
    if (trade.pnl !== null) {
      native.realized_pnl = trade.pnl;
    }
    if (trade.maker !== null) {
      native.liquidity = trade.maker ? 'MAKER' : 'TAKER';
    }
    return native;
  }
}
