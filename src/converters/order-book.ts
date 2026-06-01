import type { MarketKind, OrderBook, OrderBookLevel } from '../common/types';

/** Niveau natif `[price, size]` (chaînes décimales). */
export type LevelNative = [string, string];

/** Carnet natif Paradex (`GET /orderbook/{market}`). */
export interface OrderBookNative {
  market?: string;
  bids?: LevelNative[];
  asks?: LevelNative[];
  seq_no?: number;
  last_updated_at?: number;
  [key: string]: unknown;
}

/**
 * Convertisseur **bijectif** carnet. `n` (nb d'ordres par niveau) absent chez Paradex → `null`.
 * `seq_no` conservé dans `xtras`. `time` = `last_updated_at` (ms).
 */
export class OrderBookConverter {
  constructor(
    private readonly name: string,
    private readonly kind: MarketKind,
  ) {}

  private levels(rows: LevelNative[] | undefined): OrderBookLevel[] {
    return (rows ?? []).map(([price, size]) => ({ price, size, n: null }));
  }

  toCommon(native: OrderBookNative): OrderBook {
    const book: OrderBook = {
      name: this.name,
      kind: this.kind,
      bids: this.levels(native.bids),
      asks: this.levels(native.asks),
      time: native.last_updated_at ?? null,
    };
    if (native.seq_no !== undefined) {
      book.xtras = { seq_no: native.seq_no };
    }
    return book;
  }

  toNative(book: OrderBook): OrderBookNative {
    const native: OrderBookNative = {
      market: book.name,
      bids: book.bids.map((l) => [l.price, l.size] as LevelNative),
      asks: book.asks.map((l) => [l.price, l.size] as LevelNative),
      last_updated_at: book.time ?? undefined,
    };
    const seq = (book.xtras as { seq_no?: number } | undefined)?.seq_no;
    if (seq !== undefined) {
      native.seq_no = seq;
    }
    return native;
  }
}
