import { type InitOptions, type ParadexClient, init } from '../common/config';
import type {
  Balance,
  Candle,
  FundingRate,
  MarketKind,
  Order,
  OrderBook,
  Pair,
  Position,
  Price,
  Signer,
  SubAccount,
  Trade,
  UserTrade,
} from '../common/types';
import { dateToMs } from '../common/utils';
import type { Unsubscribe } from '../common/ws';
import { type Ack, AckConverter } from '../converters/ack';
import type { FundingPayment } from '../converters/funding-payment';
import { TYPE_TO_NATIVE } from '../converters/order';
import { setAccountMargin } from '../rest/account-margin';
import { getJwt, onboard } from '../rest/auth';
import { cancelAllOrders } from '../rest/cancel-all-orders';
import { cancelOrder } from '../rest/cancel-order';
import { editOrder } from '../rest/edit-order';
import {
  getAccountInfo,
  getBalances,
  getFundingPayments,
  getOpenOrders,
  getOrderHistory,
  getPositions,
  getSubAccounts,
  getUserTrades,
} from '../rest/get-account';
import { getBbo } from '../rest/get-bbo';
import { getCandles } from '../rest/get-candles';
import { getFundingHistory } from '../rest/get-funding-history';
import { getOrderBook } from '../rest/get-order-book';
import { fetchMarkets, getPairs } from '../rest/get-pairs';
import { getPrices } from '../rest/get-prices';
import { getTrades } from '../rest/get-trades';
import { placeOrder } from '../rest/place-order';
import { transfer, withdraw } from '../rest/transfer';
import { UnifiedWsClient } from '../ws/unified-client';
import type {
  CancelAllParams,
  CancelOrderParams,
  CandlesParams,
  EditOrderParams,
  FundingParams,
  IAccount,
  IDeadManSwitch,
  IMarginMode,
  IMarketData,
  IMarketMeta,
  IOrderHistory,
  IProductAccount,
  IPublicTrades,
  IRealtime,
  IRealtimeAllCandles,
  IRealtimePositions,
  ITrading,
  ITransfers,
  LeverageParams,
  MarginModeParams,
  OrderBookParams,
  PlaceOrderParams,
  SymbolParams,
  TradesParams,
  TransferParams,
  WithdrawParams,
} from './contract';
import type { INativeAccount, INativePerp, INativeSubAccounts, ISigning } from './native-contract';

/** Intervalle unifié → résolution Paradex (minutes) + durée d'une bougie (ms). */
const INTERVAL_TO_MINUTES: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '60m': 60,
};

function resolutionOf(interval: string): { resolution: number; intervalMs: number } {
  const minutes = INTERVAL_TO_MINUTES[interval];
  if (minutes === undefined) {
    throw new Error(
      `getCandles (Paradex) : intervalle "${interval}" non supporté (1m,3m,5m,15m,30m,1h).`,
    );
  }
  return { resolution: minutes, intervalMs: minutes * 60_000 };
}

/** Plage temporelle par défaut des bougies (start/end requis côté Paradex) : 24 h. */
const DEFAULT_CANDLE_SPAN_MS = 24 * 60 * 60 * 1000;

/** Résout `name` → `kind` via le cache des marchés (par réseau). */
class MarketsResolver {
  private readonly cache = new Map<string, Promise<Map<string, MarketKind>>>();

  constructor(private readonly client: ParadexClient) {}

  private networkKey(label?: string): string {
    return label !== undefined ? (this.client.signers[label]?.network ?? 'mainnet') : 'mainnet';
  }

  async kinds(label?: string): Promise<Map<string, MarketKind>> {
    const key = this.networkKey(label);
    let promise = this.cache.get(key);
    if (promise === undefined) {
      promise = fetchMarkets(this.client, label).then(
        (markets) =>
          new Map(
            markets.map((m) => [m.symbol, m.symbol.endsWith('-PERP') ? 'perp' : 'spot'] as const),
          ),
      );
      this.cache.set(key, promise);
    }
    return promise;
  }
}

/** Options de construction d'un {@link Paradex}. */
export interface ParadexDexOptions extends Omit<InitOptions, 'signers'> {
  /** Label du signer par défaut (sinon le 1er du registre). */
  default?: string;
}

/** Démarre un abonnement WS dont la cible dépend d'une résolution asynchrone. */
function deferredSubscribe(start: () => Promise<Unsubscribe>): Unsubscribe {
  let cancelled = false;
  let real: Unsubscribe | null = null;
  start()
    .then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        real = unsub;
      }
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    if (real !== null) {
      real();
    }
  };
}

/**
 * Scope **marché** lié à un `label`, paramétré par `kind`. Même classe pour `perp()` et `spot()`.
 * Implémente données de marché, métadonnées, trades publics, compte par produit, historique,
 * trading et mode de marge.
 */
class ParadexMarket
  implements
    IMarketData,
    IMarketMeta,
    IPublicTrades,
    IProductAccount,
    IOrderHistory,
    ITrading,
    IMarginMode
{
  constructor(
    private readonly client: ParadexClient,
    private readonly label: string | undefined,
    private readonly kind: MarketKind,
  ) {}

  private signed(): string | undefined {
    if (this.label === undefined) {
      throw new Error('Action signée : aucun signer (ajoute des signers ou un défaut).');
    }
    return this.label;
  }

  // ── IMarketData ──
  public getPairs(): Promise<Pair[]> {
    return getPairs(this.client, this.label, this.kind);
  }
  public getCandles(query: CandlesParams): Promise<Candle[]> {
    const { resolution, intervalMs } = resolutionOf(query.interval);
    const endTime = query.endTime !== undefined ? dateToMs(query.endTime) : Date.now();
    const startTime =
      query.startTime !== undefined ? dateToMs(query.startTime) : endTime - DEFAULT_CANDLE_SPAN_MS;
    return getCandles(
      this.client,
      {
        name: query.name,
        interval: query.interval,
        resolution,
        intervalMs,
        startTime,
        endTime,
        kind: this.kind,
      },
      this.label,
    );
  }
  public getOrderBook(query: OrderBookParams): Promise<OrderBook> {
    return getOrderBook(
      this.client,
      { name: query.name, limit: query.limit, kind: this.kind },
      this.label,
    );
  }
  public getPrices(): Promise<Price[]> {
    return getPrices(this.client, this.label, this.kind);
  }
  public getFundingHistory(query: FundingParams): Promise<FundingRate[]> {
    return getFundingHistory(
      this.client,
      {
        name: query.name,
        startTime: query.startTime !== undefined ? dateToMs(query.startTime) : undefined,
        endTime: query.endTime !== undefined ? dateToMs(query.endTime) : undefined,
        limit: query.limit,
      },
      this.label,
    );
  }

  // ── IMarketMeta ──
  public getExchangeInfo(): Promise<unknown> {
    return fetchMarkets(this.client, this.label);
  }

  // ── IPublicTrades ──
  public getTrades(query: TradesParams): Promise<Trade[]> {
    return getTrades(this.client, { name: query.name, limit: query.limit }, this.label);
  }

  // ── IProductAccount ──
  public async getPositions(query?: SymbolParams): Promise<Position[]> {
    const positions = await getPositions(this.client, this.signed());
    const ofKind = positions.filter((p) => p.name.endsWith('-PERP') === (this.kind === 'perp'));
    return query?.name !== undefined ? ofKind.filter((p) => p.name === query.name) : ofKind;
  }
  public getOpens(query?: SymbolParams): Promise<Order[]> {
    return getOpenOrders(this.client, { name: query?.name, kind: this.kind }, this.signed());
  }
  public getUserTrades(query?: SymbolParams): Promise<UserTrade[]> {
    return getUserTrades(this.client, { name: query?.name, kind: this.kind }, this.signed());
  }
  public getAccountInfo(): Promise<unknown> {
    return getAccountInfo(this.client, this.signed());
  }

  // ── IOrderHistory ──
  public getHistory(query?: SymbolParams): Promise<Order[]> {
    return getOrderHistory(this.client, { name: query?.name, kind: this.kind }, this.signed());
  }

  // ── ITrading ──
  public place(input: PlaceOrderParams): Promise<Order> {
    return placeOrder(this.client, this.signed(), { ...input, kind: this.kind });
  }
  public cancel(input: CancelOrderParams): Promise<void> {
    return cancelOrder(this.client, this.signed(), { id: input.id, clientId: input.clientId });
  }
  public async cancelAll(input: CancelAllParams): Promise<{ cancelled: number | null }> {
    await cancelAllOrders(this.client, this.signed(), input.name);
    return { cancelled: null };
  }
  public edit(input: EditOrderParams): Promise<{ name: string; id: string }> {
    if (input.id === undefined) {
      throw new Error("edit (Paradex) : `id` est requis (Paradex modifie par id d'ordre).");
    }
    return editOrder(this.client, this.signed(), {
      id: input.id,
      name: input.name,
      side: input.side,
      size: input.size,
      price: input.price,
      orderType: TYPE_TO_NATIVE.limit,
    });
  }
  public updateLeverage(input: LeverageParams): Promise<unknown> {
    return setAccountMargin(this.client, this.signed(), {
      name: input.name,
      leverage: input.leverage,
    });
  }

  // ── IMarginMode ──
  public async setMarginMode(input: MarginModeParams): Promise<void> {
    await setAccountMargin(this.client, this.signed(), {
      name: input.name,
      marginType: input.isolated ? 'ISOLATED' : 'CROSS',
    });
  }
}

/** Scope **compte transverse** : soldes, retrait, kill-switch (via WS `cancel_on_disconnect`). */
class ParadexAccount implements IAccount, IDeadManSwitch {
  private readonly ack = new AckConverter();

  constructor(
    private readonly client: ParadexClient,
    private readonly label: string | undefined,
    private readonly wsClient: UnifiedWsClient,
  ) {}

  private signed(): string {
    if (this.label === undefined) {
      throw new Error('Action signée : aucun signer (ajoute des signers ou un défaut).');
    }
    return this.label;
  }

  public getBalances(): Promise<Balance[]> {
    return getBalances(this.client, this.signed());
  }
  public async withdraw(input: WithdrawParams): Promise<Ack> {
    const native = await withdraw(this.client, this.signed(), {
      amount: input.amount,
      address: input.address,
      asset: input.asset,
    });
    return this.ack.toCommon(native);
  }

  // ── IDeadManSwitch (Paradex : order.cancel_on_disconnect via WS JSON-RPC) ──
  public async armCancelAll(afterMs: number): Promise<unknown> {
    await this.ensureWsAuth();
    return this.wsClient.raw().request('order.cancel_on_disconnect', { timeout_ms: afterMs });
  }
  public async disarm(): Promise<unknown> {
    await this.ensureWsAuth();
    // 0 = désarmé (à confirmer testnet).
    return this.wsClient.raw().request('order.cancel_on_disconnect', { timeout_ms: 0 });
  }

  private async ensureWsAuth(): Promise<void> {
    const jwt = await getJwt(this.client, this.signed());
    this.wsClient.setBearer(jwt);
  }
}

/**
 * Transferts de fonds. `TransferParams` est **narrowé** à `to: { subAccount }` (collatéral USDC)
 * au niveau type → aucune route invalide ne compile, donc **aucun throw** « non supporté ».
 */
class ParadexTransfers implements ITransfers {
  constructor(
    private readonly client: ParadexClient,
    private readonly label: string | undefined,
  ) {}

  private signed(): string {
    if (this.label === undefined) {
      throw new Error('Action signée : aucun signer (ajoute des signers ou un défaut).');
    }
    return this.label;
  }

  public transfer(params: TransferParams): Promise<unknown> {
    if (!('subAccount' in params.to)) {
      throw new Error('transfer (Paradex) : destination `to.subAccount` requise.');
    }
    return transfer(this.client, this.signed(), {
      subAccount: params.to.subAccount,
      amount: params.amount,
      asset: params.asset,
    });
  }
}

/** Scope **temps réel** lié à un `label`, paramétré par `kind`. */
class ParadexRealtime implements IRealtime, IRealtimePositions, IRealtimeAllCandles {
  constructor(
    private readonly ws: UnifiedWsClient,
    private readonly client: ParadexClient,
    private readonly label: string | undefined,
    private readonly markets: MarketsResolver,
    private readonly kind: MarketKind,
  ) {}

  private async authed(): Promise<void> {
    if (this.label !== undefined) {
      const jwt = await getJwt(this.client, this.label);
      this.ws.setBearer(jwt);
    }
  }

  // Bougies 1m de tout le marché en UNE souscription : on bucketise le flux de prix agrégé (subscribePrices) par
  // symbole. close exact ; OHLC échantillonné ; volume non porté par le flux agrégé → 0. API uniforme sur les DEX.
  public subscribeAllCandles(cb: (c: Candle) => void) {
    const forming = new Map<string, { t: number; o: number; h: number; l: number; c: number }>();
    return this.subscribePrices((prices) => {
      const t = Math.floor(Date.now() / 60_000) * 60_000;
      for (const p of prices) {
        const px = Number(p.mid ?? p.last ?? p.mark ?? p.oracle);
        if (!Number.isFinite(px)) {
          continue;
        }
        let f = forming.get(p.name);
        if (f === undefined || f.t !== t) {
          f = { t, o: px, h: px, l: px, c: px };
          forming.set(p.name, f);
        } else {
          f.h = Math.max(f.h, px);
          f.l = Math.min(f.l, px);
          f.c = px;
        }
        cb({
          t: f.t,
          T: f.t + 60_000,
          s: p.name,
          i: '1m',
          o: String(f.o),
          h: String(f.h),
          l: String(f.l),
          c: String(f.c),
          v: '0',
          n: 0,
          kind: p.kind,
          qv: null,
          tbbv: null,
          tbqv: null,
        });
      }
    });
  }

  public subscribeCandles(query: { name: string; interval: string }, cb: (c: Candle) => void) {
    const { resolution, intervalMs } = resolutionOf(query.interval);
    return this.ws.subscribeCandles(
      query.name,
      query.interval,
      resolution,
      intervalMs,
      this.kind,
      cb,
    );
  }
  public subscribeOrderBook(query: { name: string }, cb: (b: OrderBook) => void) {
    return this.ws.subscribeOrderBook(query.name, this.kind, cb);
  }
  public subscribeTrades(query: { name: string }, cb: (t: Trade) => void) {
    return this.ws.subscribeTrades(query.name, cb);
  }
  public subscribeBbo(query: { name: string }, cb: (b: OrderBook) => void) {
    return this.ws.subscribeBbo(query.name, this.kind, cb);
  }
  public subscribePrices(cb: (p: Price[]) => void) {
    // Paradex publie le summary par marché : on s'abonne à tous les marchés du type courant et on
    // émet le tableau complet à chaque mise à jour (fan-out).
    return deferredSubscribe(async () => {
      const kinds = await this.markets.kinds(this.label);
      const names = [...kinds.entries()].filter(([, k]) => k === this.kind).map(([n]) => n);
      const byName = new Map<string, Price>();
      const unsubs = names.map((name) =>
        this.ws.subscribePrices(name, this.kind, (price) => {
          byName.set(name, price);
          cb([...byName.values()]);
        }),
      );
      return () => {
        for (const u of unsubs) {
          u();
        }
      };
    });
  }
  public subscribeOrders(cb: (o: Order) => void) {
    return deferredSubscribe(async () => {
      await this.authed();
      const kinds = await this.markets.kinds(this.label);
      const names = [...kinds.entries()].filter(([, k]) => k === this.kind).map(([n]) => n);
      const unsubs = names.map((name) => this.ws.subscribeOrders(name, this.kind, cb));
      return () => {
        for (const u of unsubs) {
          u();
        }
      };
    });
  }
  public subscribeUserTrades(cb: (t: UserTrade) => void) {
    return deferredSubscribe(async () => {
      await this.authed();
      const kinds = await this.markets.kinds(this.label);
      const names = [...kinds.entries()].filter(([, k]) => k === this.kind).map(([n]) => n);
      const unsubs = names.map((name) => this.ws.subscribeUserTrades(name, this.kind, cb));
      return () => {
        for (const u of unsubs) {
          u();
        }
      };
    });
  }
  public subscribePositions(cb: (p: Position) => void) {
    return deferredSubscribe(async () => {
      await this.authed();
      return this.ws.subscribePositions((msg) => {
        if (msg !== null && typeof msg === 'object' && !Array.isArray(msg)) {
          const p = msg as Record<string, unknown>;
          const size = String(p.size ?? '0');
          cb({
            name: String(p.market ?? ''),
            side:
              Number(size) === 0
                ? null
                : String(p.side ?? '').toUpperCase() === 'SHORT' || Number(size) < 0
                  ? 'short'
                  : 'long',
            size: String(Math.abs(Number(size))),
            entryPrice: p.average_entry_price != null ? String(p.average_entry_price) : null,
            markPrice: p.mark_price != null ? String(p.mark_price) : null,
            unrealizedPnl: p.unrealized_pnl != null ? String(p.unrealized_pnl) : null,
            leverage: p.leverage != null ? Number(p.leverage) : null,
            liquidationPrice: p.liquidation_price != null ? String(p.liquidation_price) : null,
            margin: null,
            xtras: p,
          });
        }
      });
    });
  }
}

/** Base des scopes natifs (résolution du label). */
class ParadexScope {
  constructor(
    protected readonly client: ParadexClient,
    protected readonly label: string | undefined,
  ) {}

  protected signed(): string {
    if (this.label === undefined) {
      throw new Error('Action signée : aucun signer (ajoute des signers ou un défaut).');
    }
    return this.label;
  }
}

/** Surplus **perp** Paradex (miroir natif de `perp()`) : BBO REST. */
class ParadexNativePerp extends ParadexScope implements INativePerp {
  constructor(
    client: ParadexClient,
    label: string | undefined,
    private readonly kind: MarketKind,
  ) {
    super(client, label);
  }
  public getBbo(query: { name: string }): Promise<OrderBook> {
    return getBbo(this.client, { name: query.name, kind: this.kind }, this.label);
  }
}

/** Surplus **compte** Paradex (miroir natif de `account()`) : paiements de funding. */
class ParadexNativeAccount extends ParadexScope implements INativeAccount {
  public getFundingPayments(query: { name: string; limit?: number }): Promise<FundingPayment[]> {
    return getFundingPayments(this.client, query, this.signed());
  }
}

/** Gestion des **sous-comptes**. */
class ParadexNativeSubAccounts extends ParadexScope implements INativeSubAccounts {
  public getList(): Promise<SubAccount[]> {
    return getSubAccounts(this.client, this.signed());
  }
}

/** Capacités **signing / auth** Paradex. */
class ParadexSigning extends ParadexScope implements ISigning {
  public onboard(): Promise<void> {
    return onboard(this.client, this.signed());
  }
  public getJwt(expirationSeconds?: number): Promise<string> {
    return getJwt(this.client, this.signed(), expirationSeconds);
  }
}

/**
 * Façade **Paradex** : `const dex = new Paradex({ deskA: signer }, { default: 'deskA' })`, puis
 * `dex.perp(label?)` / `dex.spot(label?)` (marché + trading + compte du produit), `dex.account(label?)`
 * (compte transverse + kill-switch), `dex.transfers(label?)` (transferts), `dex.ws(label?)` /
 * `dex.wsSpot(label?)` (temps réel). Surplus spécifique via `dex.native.<cap>()` : `perp` (BBO),
 * `account` (funding payments), `subAccounts`, `signing` (onboarding/JWT).
 *
 * Chaque instance détient son propre {@link ParadexClient} (config isolée, mainnet + testnet
 * coexistent par label). La signature **SNIP-12 Stark** et le JWT sont dérivés du signer choisi.
 */
export class Paradex {
  private readonly client: ParadexClient;
  private readonly defaultLabel: string | undefined;
  private readonly markets: MarketsResolver;
  private readonly wsClients = new Map<string, UnifiedWsClient>();

  constructor(signers: Record<string, Signer> = {}, options: ParadexDexOptions = {}) {
    const { default: defaultLabel, ...init0 } = options;
    this.client = init({ ...init0, signers });
    this.defaultLabel = defaultLabel ?? Object.keys(signers)[0];
    this.markets = new MarketsResolver(this.client);
  }

  private resolve(label?: string): string | undefined {
    return label ?? this.defaultLabel;
  }

  /** Scope marché **perp**. */
  public perp(label?: string): ParadexMarket {
    return new ParadexMarket(this.client, this.resolve(label), 'perp');
  }

  /** Scope marché **spot** (Paradex expose aussi quelques marchés spot). */
  public spot(label?: string): ParadexMarket {
    return new ParadexMarket(this.client, this.resolve(label), 'spot');
  }

  /** Scope **compte** transverse (soldes, retrait, kill-switch). */
  public account(label?: string): ParadexAccount {
    const resolved = this.resolve(label);
    return new ParadexAccount(this.client, resolved, this.unifiedWs(resolved));
  }

  /** Scope **transferts** unifié (Paradex : vers un sous-compte). */
  public transfers(label?: string): ParadexTransfers {
    return new ParadexTransfers(this.client, this.resolve(label));
  }

  /** Scope **temps réel** perp. */
  public ws(label?: string): ParadexRealtime {
    const resolved = this.resolve(label);
    return new ParadexRealtime(
      this.unifiedWs(resolved),
      this.client,
      resolved,
      this.markets,
      'perp',
    );
  }

  /** Scope **temps réel** spot. */
  public wsSpot(label?: string): ParadexRealtime {
    const resolved = this.resolve(label);
    return new ParadexRealtime(
      this.unifiedWs(resolved),
      this.client,
      resolved,
      this.markets,
      'spot',
    );
  }

  /** Capacités **spécifiques à Paradex** (namespace `native`, convention partagée par les 5 SDK). */
  public get native() {
    const c = this.client;
    const r = (label?: string) => this.resolve(label);
    return {
      /** Surplus **perp** (miroir natif de perp()) : BBO REST — `INativePerp`. */
      perp: (label?: string) => new ParadexNativePerp(c, r(label), 'perp'),
      /** Surplus **spot** (BBO REST) — `INativePerp`. */
      spot: (label?: string) => new ParadexNativePerp(c, r(label), 'spot'),
      /** Surplus **compte** : paiements de funding — `INativeAccount`. */
      account: (label?: string) => new ParadexNativeAccount(c, r(label)),
      /** Sous-comptes (liste) — `INativeSubAccounts`. */
      subAccounts: (label?: string) => new ParadexNativeSubAccounts(c, r(label)),
      /** Signature / auth (onboarding, JWT) — `ISigning`. */
      signing: (label?: string) => new ParadexSigning(c, r(label)),
    };
  }

  /** Un client WS unifié par label (partage le ref-counting du socket). */
  private unifiedWs(label: string | undefined): UnifiedWsClient {
    const key = label ?? '';
    let ws = this.wsClients.get(key);
    if (ws === undefined) {
      ws = new UnifiedWsClient(this.client, { label });
      this.wsClients.set(key, ws);
    }
    return ws;
  }
}
