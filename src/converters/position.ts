import type { Position } from '../common/types';

/** Position native Paradex (`GET /positions`). */
export interface PositionNative {
  market?: string;
  side?: string;
  size?: string;
  average_entry_price?: string;
  mark_price?: string;
  unrealized_pnl?: string;
  leverage?: string | number;
  liquidation_price?: string;
  margin?: string;
  status?: string;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set([
  'market',
  'side',
  'size',
  'average_entry_price',
  'mark_price',
  'unrealized_pnl',
  'leverage',
  'liquidation_price',
  'margin',
]);

const s = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

/**
 * Convertisseur **bijectif** position. `side` depuis le champ natif (`LONG`/`SHORT`) sinon depuis
 * le signe de la taille. Une taille nulle ⇒ `side: null`. Surplus en `xtras`.
 */
export class PositionConverter {
  toCommon(native: PositionNative): Position {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    const size = native.size ?? '0';
    const sign = Number(size);
    const sideRaw = String(native.side ?? '').toUpperCase();
    const side: Position['side'] =
      sign === 0
        ? null
        : sideRaw === 'LONG'
          ? 'long'
          : sideRaw === 'SHORT'
            ? 'short'
            : sign < 0
              ? 'short'
              : 'long';
    const position: Position = {
      name: native.market ?? '',
      side,
      size: String(Math.abs(sign)),
      entryPrice: s(native.average_entry_price),
      markPrice: s(native.mark_price),
      unrealizedPnl: s(native.unrealized_pnl),
      leverage: native.leverage !== undefined ? Number(native.leverage) : null,
      liquidationPrice: s(native.liquidation_price),
      margin: s(native.margin),
    };
    if (Object.keys(xtras).length > 0) {
      position.xtras = xtras;
    }
    return position;
  }

  toNative(position: Position): PositionNative {
    const xtras = (position.xtras ?? {}) as Record<string, unknown>;
    const signed = position.side === 'short' ? `-${position.size}` : position.size;
    const native: PositionNative = {
      ...xtras,
      market: position.name,
      side: position.side === null ? undefined : position.side.toUpperCase(),
      size: signed,
    };
    if (position.entryPrice !== null) {
      native.average_entry_price = position.entryPrice;
    }
    if (position.markPrice !== null) {
      native.mark_price = position.markPrice;
    }
    if (position.unrealizedPnl !== null) {
      native.unrealized_pnl = position.unrealizedPnl;
    }
    if (position.leverage !== null) {
      native.leverage = position.leverage;
    }
    if (position.liquidationPrice !== null) {
      native.liquidation_price = position.liquidationPrice;
    }
    if (position.margin !== null) {
      native.margin = position.margin;
    }
    return native;
  }
}
