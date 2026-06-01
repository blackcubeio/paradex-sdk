import type { MarketKind, Order, Side } from '../common/types';

/** Ordre natif Paradex (`GET /orders`, `POST /orders`). Formes à confirmer testnet. */
export interface OrderNative {
  id?: string;
  client_id?: string;
  market?: string;
  side?: string;
  type?: string;
  size?: string;
  remaining_size?: string;
  price?: string;
  trigger_price?: string;
  instruction?: string;
  status?: string;
  flags?: string[];
  created_at?: number;
  last_updated_at?: number;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set([
  'id',
  'client_id',
  'market',
  'side',
  'type',
  'size',
  'remaining_size',
  'price',
  'instruction',
  'status',
  'created_at',
]);

/** `BUY`/`SELL` → côté unifié. */
function toSide(side: string | undefined): Side {
  return String(side).toUpperCase() === 'SELL' ? 'sell' : 'buy';
}

/** Type natif Paradex → type unifié. */
const TYPE_TO_COMMON: Record<string, Order['type']> = {
  LIMIT: 'limit',
  MARKET: 'market',
  STOP_LIMIT: 'stop',
  STOP_MARKET: 'stopMarket',
  STOP_LOSS_LIMIT: 'stop',
  STOP_LOSS_MARKET: 'stopMarket',
  TAKE_PROFIT_LIMIT: 'takeProfit',
  TAKE_PROFIT_MARKET: 'takeProfitMarket',
};

/** Type unifié → type natif Paradex. */
export const TYPE_TO_NATIVE: Record<Order['type'], string> = {
  limit: 'LIMIT',
  market: 'MARKET',
  stop: 'STOP_LIMIT',
  stopMarket: 'STOP_MARKET',
  takeProfit: 'TAKE_PROFIT_LIMIT',
  takeProfitMarket: 'TAKE_PROFIT_MARKET',
  trailingStop: 'STOP_MARKET',
  other: 'LIMIT',
};

/** Statut natif → statut unifié. */
const STATUS_TO_COMMON: Record<string, Order['status']> = {
  NEW: 'open',
  OPEN: 'open',
  UNTRIGGERED: 'open',
  CLOSED: 'filled',
  FILLED: 'filled',
  PARTIALLY_FILLED: 'partiallyFilled',
  CANCELED: 'canceled',
  CANCELLED: 'canceled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

/** Instruction (TIF) native → TIF unifié. `POST_ONLY` → `alo`. */
const TIF_TO_COMMON: Record<string, Order['tif']> = {
  GTC: 'gtc',
  IOC: 'ioc',
  FOK: 'fok',
  POST_ONLY: 'alo',
  RPI: 'gtc',
};

/**
 * Convertisseur **bijectif** ordre. `filled` = `size - remaining_size`. `reduceOnly` dérivé des
 * `flags`. Le surplus natif (trigger, flags, last_updated_at…) va dans `xtras` → bijection.
 */
export class OrderConverter {
  constructor(private readonly kind: MarketKind) {}

  toCommon(native: OrderNative): Order {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    if (native.remaining_size !== undefined) {
      xtras.remaining_size = native.remaining_size;
    }
    const size = native.size ?? '0';
    const remaining = native.remaining_size ?? size;
    const filled = String(Number(size) - Number(remaining));
    const typeKey = String(native.type ?? '').toUpperCase();
    const order: Order = {
      name: native.market ?? '',
      kind: this.kind,
      id: String(native.id ?? ''),
      clientId: native.client_id ?? null,
      side: toSide(native.side),
      type: TYPE_TO_COMMON[typeKey] ?? 'other',
      price: native.price ?? null,
      size: String(size),
      filled,
      status: STATUS_TO_COMMON[String(native.status ?? '').toUpperCase()] ?? 'other',
      tif: TIF_TO_COMMON[String(native.instruction ?? '').toUpperCase()] ?? null,
      reduceOnly: native.flags?.includes('REDUCE_ONLY') ?? null,
      time: native.created_at ?? 0,
    };
    if (Object.keys(xtras).length > 0) {
      order.xtras = xtras;
    }
    return order;
  }

  toNative(order: Order): OrderNative {
    const xtras = (order.xtras ?? {}) as Record<string, unknown>;
    const native: OrderNative = {
      ...xtras,
      id: order.id,
      client_id: order.clientId ?? undefined,
      market: order.name,
      side: order.side.toUpperCase(),
      type: TYPE_TO_NATIVE[order.type],
      size: order.size,
      remaining_size: String(Number(order.size) - Number(order.filled || '0')),
      price: order.price ?? undefined,
      status: order.status.toUpperCase(),
      created_at: order.time,
    };
    if (order.reduceOnly === true) {
      native.flags = ['REDUCE_ONLY'];
    }
    return native;
  }
}
