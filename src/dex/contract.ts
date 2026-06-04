import type {
  Balance,
  Candle,
  FundingRate,
  Order,
  OrderBook,
  Pair,
  Position,
  Price,
  Side,
  SubAccount,
  Trade,
  UserTrade,
} from '../common/types';
import type { Unsubscribe } from '../common/ws';
import type { Ack } from '../converters/ack';

/**
 * Contrat **commun aux SDK DEX Blackcube** (Aster / Hyperliquid / Pacifica / Lighter / Paradex).
 * Décomposé en interfaces par **capacité** : chaque DEX implémente celles qu'il possède. Ces
 * interfaces sont **identiques** d'un dépôt à l'autre (copiées) ; on ne les étend que par ajout.
 *
 * Les types métier (`Candle`, `Order`…) sont les types **unifiés Blackcube**. Le `kind` (perp/spot)
 * n'est PAS dans les params : il est porté par le **scope** (`dex.perp()` / `dex.spot()`). Paradex
 * étant un DEX **perp** (avec quelques marchés spot), le scope principal est `perp()`.
 */

// ── Ré-export des Params depuis common/types (vocabulaire commun) ─────────────
export type {
  CandlesParams,
  OrderBookParams,
  TradesParams,
  FundingParams,
  SymbolParams,
  PlaceOrderParams,
  CancelOrderParams,
  CancelAllParams,
  EditOrderParams,
  LeverageParams,
  MarginModeParams,
  WithdrawParams,
} from '../common/types';

import type {
  CancelAllParams,
  CancelOrderParams,
  CandlesParams,
  EditOrderParams,
  FundingParams,
  LeverageParams,
  MarginModeParams,
  OrderBookParams,
  PlaceOrderParams,
  SymbolParams,
  TradesParams,
  WithdrawParams,
} from '../common/types';

// ── Capacités MARCHÉ (retournées par perp() / spot()) ─────────────────────────

/** Données de marché publiques. */
export interface IMarketData {
  getPairs(): Promise<Pair[]>;
  getCandles(query: CandlesParams): Promise<Candle[]>;
  getOrderBook(query: OrderBookParams): Promise<OrderBook>;
  getPrices(): Promise<Price[]>;
  getFundingHistory(query: FundingParams): Promise<FundingRate[]>;
}

/** Métadonnées de marché du produit (univers brut, passe-plat non normalisé). */
export interface IMarketMeta {
  /**
   * Brut volontaire — **pas de forme commune cross-DEX** : `GET /markets` complet (toutes les
   * métadonnées natives Paradex). `unknown` **assumé**, pas un oubli.
   */
  getExchangeInfo(): Promise<unknown>;
}

/** Historique de trades publics en REST. */
export interface IPublicTrades {
  getTrades(query: TradesParams): Promise<Trade[]>;
}

/** Placement/annulation/édition d'ordres + levier. */
export interface ITrading {
  place(input: PlaceOrderParams): Promise<Order>;
  cancel(input: CancelOrderParams): Promise<void>;
  cancelAll(input: CancelAllParams): Promise<{ cancelled: number | null }>;
  /**
   * Modifie un ordre. Paradex resigne le `ModifyOrder` ; ne renvoie que **l'identité**
   * (`{ name, id }`), pas un snapshot complet. Relire l'état via `getOpens`.
   */
  edit(input: EditOrderParams): Promise<{ name: string; id: string }>;
  updateLeverage(input: LeverageParams): Promise<unknown>;
}

/** Mode de marge cross/isolated. */
export interface IMarginMode {
  setMarginMode(input: MarginModeParams): Promise<void>;
}

// ── Compte PAR PRODUIT (retourné par perp() / spot()) ─────────────────────────

/** Lectures de compte liées au produit, portées par le scope marché. */
export interface IProductAccount {
  getPositions(query?: SymbolParams): Promise<Position[]>;
  getOpens(query?: SymbolParams): Promise<Order[]>;
  getUserTrades(query?: SymbolParams): Promise<UserTrade[]>;
  /**
   * Brut volontaire — **pas de forme commune cross-DEX** : `GET /account` (état complet Paradex).
   * `unknown` **assumé**, pas un oubli.
   */
  getAccountInfo(): Promise<unknown>;
}

/** Historique des ordres du produit. */
export interface IOrderHistory {
  getHistory(query?: SymbolParams): Promise<Order[]>;
}

// ── Capacités COMPTE TRANSVERSE (retournées par account()) ────────────────────

/** Compte transverse : soldes + retrait. */
export interface IAccount {
  getBalances(): Promise<Balance[]>;
  /** Retrait. Renvoie un {@link Ack} commun (`ok` + `xtras` = réponse native complète). */
  withdraw(input: WithdrawParams): Promise<Ack>;
}

/** Liste des sous-comptes. */
export interface ISubAccounts {
  getSubAccounts(): Promise<SubAccount[]>;
}

/** Endpoint d'un transfert : OÙ vont les fonds (C7/unifié). */
export type TransferEndpoint =
  | { wallet: 'perp' | 'spot' }
  | { account: string }
  | { subAccount: string };

/** Paramètres unifiés d'un transfert de fonds. */
export interface TransferParams {
  from?: TransferEndpoint;
  to: TransferEndpoint;
  asset?: string;
  amount: string;
}

/** **LE** domaine pour bouger des fonds. */
export interface ITransfers {
  transfer(params: TransferParams): Promise<unknown>;
}

/**
 * **Kill-switch / dead-man's switch serveur** : annule TOUS les ordres après `afterMs` ms de
 * silence, à rafraîchir périodiquement (heartbeat). Paradex l'offre via la méthode WS JSON-RPC
 * `order.cancel_on_disconnect` → implémenté sur `account()`. Jamais simulé côté client.
 */
export interface IDeadManSwitch {
  /** Arme/rafraîchit l'annulation auto de tous les ordres après `afterMs` ms sans nouvel appel. */
  armCancelAll(afterMs: number): Promise<unknown>;
  /** Désarme le kill-switch. */
  disarm(): Promise<unknown>;
}

// ── Capacités TEMPS RÉEL (retournées par ws()) ────────────────────────────────
// Pas de connect/disconnect : lazy-connect au 1er subscribe, auto-close au dernier unsubscribe.

/** Souscriptions temps réel communes. */
export interface IRealtime {
  subscribeCandles(query: { name: string; interval: string }, cb: (c: Candle) => void): Unsubscribe;
  subscribeOrderBook(query: { name: string }, cb: (b: OrderBook) => void): Unsubscribe;
  subscribeTrades(query: { name: string }, cb: (t: Trade) => void): Unsubscribe;
  subscribeBbo(query: { name: string }, cb: (b: OrderBook) => void): Unsubscribe;
  subscribePrices(cb: (p: Price[]) => void): Unsubscribe;
  subscribeOrders(cb: (o: Order) => void): Unsubscribe;
  subscribeUserTrades(cb: (t: UserTrade) => void): Unsubscribe;
}

/**
 * Souscription « tout le marché » en UNE connexion : bougies 1m de TOUS les symboles reconstruites depuis le flux
 * de prix agrégé (close exact ; OHLC échantillonné ; volume non fourni par le flux agrégé → `0`). Évite N
 * souscriptions `@candle` (cap/throttle par connexion + crawl de re-souscription au reconnect). API uniforme sur les DEX.
 */
export interface IRealtimeAllCandles {
  subscribeAllCandles(cb: (c: Candle) => void): Unsubscribe;
}

/** Souscription aux positions (Paradex a un channel `positions`). */
export interface IRealtimePositions {
  subscribePositions(cb: (p: Position) => void): Unsubscribe;
}

/** Ré-exports pratiques (utilisés par la façade et la doc). */
export type { Side };
