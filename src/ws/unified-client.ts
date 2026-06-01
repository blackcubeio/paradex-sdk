import type { ParadexClient } from '../common/config';
import type {
  Candle,
  JsonValue,
  MarketKind,
  Order,
  OrderBook,
  Price,
  Trade,
  UserTrade,
} from '../common/types';
import type { Unsubscribe, WsClientOptions } from '../common/ws';
import { OrderConverter, type OrderNative } from '../converters/order';
import { type MarketSummaryNative, PriceConverter } from '../converters/price';
import { TradeConverter, type TradeNative } from '../converters/trade';
import { type FillNative, UserTradeConverter } from '../converters/user-trade';
import { ParadexWsClient } from './client';

type Obj = Record<string, JsonValue>;

const asObj = (v: JsonValue | undefined): Obj | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;

const asArr = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);

/**
 * Client WebSocket **unifié** Paradex : enveloppe {@link ParadexWsClient} et convertit les payloads
 * natifs vers les types Blackcube. Lazy-connect hérité du client natif. Le `kind` est porté par
 * l'appelant (scope `ws()`/`wsSpot()`).
 */
export class UnifiedWsClient {
  private readonly ws: ParadexWsClient;

  constructor(client: ParadexClient, options: WsClientOptions = {}) {
    this.ws = new ParadexWsClient(client, options);
  }

  public set onError(cb: ((error: unknown) => void) | null) {
    this.ws.onError = cb;
  }
  public set onClose(cb: (() => void) | null) {
    this.ws.onClose = cb;
  }
  public set onReconnect(cb: (() => void) | null) {
    this.ws.onReconnect = cb;
  }

  /** Renseigne le bearer JWT pour les channels privés et le trading WS. */
  public setBearer(bearer: string): void {
    this.ws.setBearer(bearer);
  }

  /** Accès au client brut (kill-switch / trading WS via `request`). */
  public raw(): ParadexWsClient {
    return this.ws;
  }

  /** Bougies temps réel — canal `klines.{m}.{resolution}` (forme à confirmer testnet). */
  subscribeCandles(
    name: string,
    interval: string,
    resolution: number,
    intervalMs: number,
    kind: MarketKind,
    cb: (candle: Candle) => void,
  ): Unsubscribe {
    return this.ws.subscribe(`klines.${name}.${resolution}`, (msg) => {
      const o = asObj(msg);
      if (o === undefined) {
        return;
      }
      cb({
        t: Number(o.timestamp ?? o.t ?? 0),
        T: Number(o.timestamp ?? o.t ?? 0) + intervalMs - 1,
        s: name,
        i: interval,
        o: String(o.open ?? o.o ?? '0'),
        c: String(o.close ?? o.c ?? '0'),
        h: String(o.high ?? o.h ?? '0'),
        l: String(o.low ?? o.l ?? '0'),
        v: String(o.volume ?? o.v ?? '0'),
        n: 0,
        kind,
        qv: null,
        tbbv: null,
        tbqv: null,
        xtras: o,
      });
    });
  }

  /** Carnet temps réel — canal `order_book.{m}.snapshot@15@100ms` (snapshot complet). */
  subscribeOrderBook(name: string, kind: MarketKind, cb: (book: OrderBook) => void): Unsubscribe {
    return this.ws.subscribe(`order_book.${name}.snapshot@15@100ms`, (msg) => {
      const o = asObj(msg);
      if (o === undefined) {
        return;
      }
      const levels = (rows: JsonValue[]) =>
        rows
          .map((row) => {
            if (Array.isArray(row)) {
              return { price: String(row[0]), size: String(row[1]), n: null };
            }
            const obj = asObj(row);
            return obj === undefined
              ? null
              : { price: String(obj.price), size: String(obj.size), n: null };
          })
          .filter((l): l is { price: string; size: string; n: null } => l !== null);
      cb({
        name,
        kind,
        bids: levels(asArr(o.bids)),
        asks: levels(asArr(o.asks)),
        time: o.last_updated_at !== undefined ? Number(o.last_updated_at) : null,
      });
    });
  }

  /** BBO temps réel — canal `bbo.{m}`. */
  subscribeBbo(name: string, kind: MarketKind, cb: (book: OrderBook) => void): Unsubscribe {
    return this.ws.subscribe(`bbo.${name}`, (msg) => {
      const o = asObj(msg);
      if (o === undefined) {
        return;
      }
      cb({
        name,
        kind,
        bids:
          o.bid !== undefined
            ? [{ price: String(o.bid), size: String(o.bid_size ?? '0'), n: null }]
            : [],
        asks:
          o.ask !== undefined
            ? [{ price: String(o.ask), size: String(o.ask_size ?? '0'), n: null }]
            : [],
        time: o.last_updated_at !== undefined ? Number(o.last_updated_at) : null,
      });
    });
  }

  /** Trades publics temps réel — canal `trades.{m}`. */
  subscribeTrades(name: string, cb: (trade: Trade) => void): Unsubscribe {
    const converter = new TradeConverter();
    return this.ws.subscribe(`trades.${name}`, (msg) => {
      const o = asObj(msg);
      if (o !== undefined) {
        cb(converter.toCommon({ ...(o as unknown as TradeNative), market: name }));
      }
    });
  }

  /** Prix (summary) temps réel — canal `markets_summary.{m}`. */
  subscribePrices(name: string, kind: MarketKind, cb: (price: Price) => void): Unsubscribe {
    const converter = new PriceConverter(kind);
    return this.ws.subscribe(`markets_summary.${name}`, (msg) => {
      const o = asObj(msg);
      if (o !== undefined) {
        cb(converter.toCommon({ ...(o as unknown as MarketSummaryNative), symbol: name }));
      }
    });
  }

  /** Ordres du compte temps réel — canal `orders.{m}` (auth requise). */
  subscribeOrders(name: string, kind: MarketKind, cb: (order: Order) => void): Unsubscribe {
    const converter = new OrderConverter(kind);
    return this.ws.subscribe(`orders.${name}`, (msg) => {
      const o = asObj(msg);
      if (o !== undefined) {
        cb(converter.toCommon(o as unknown as OrderNative));
      }
    });
  }

  /** Fills du compte temps réel — canal `fills.{m}` (auth requise). */
  subscribeUserTrades(name: string, kind: MarketKind, cb: (trade: UserTrade) => void): Unsubscribe {
    const converter = new UserTradeConverter(kind);
    return this.ws.subscribe(`fills.${name}`, (msg) => {
      const o = asObj(msg);
      if (o !== undefined) {
        cb(converter.toCommon(o as unknown as FillNative));
      }
    });
  }

  /** Positions du compte temps réel — canal `positions` (auth requise). */
  subscribePositions(cb: (msg: JsonValue) => void): Unsubscribe {
    return this.ws.subscribe('positions', cb);
  }

  /** Abonnement brut à un channel privé (callback message natif). */
  subscribeRaw(channel: string, cb: (msg: JsonValue) => void): Unsubscribe {
    return this.ws.subscribe(channel, cb);
  }

  close(): void {
    this.ws.close();
  }
}
