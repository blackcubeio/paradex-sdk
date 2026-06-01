// Types unifiés Paradex — **identiques** aux autres SDK DEX Blackcube (cf. doc/common.md). Les types
// natifs spécifiques à Paradex vivent dans les modules concernés / common/native.ts.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Network = 'mainnet' | 'testnet';
export type Side = 'buy' | 'sell';
export type MarketKind = 'perp' | 'spot';

/**
 * Signer Paradex : **compte Starknet L2**. La clé L2 Stark signe en SNIP-12 (ordres) et produit le
 * JWT d'authentification. `l2Address` = adresse du compte (lectures privées / header). Réseau porté
 * par le signer (mainnet/testnet coexistent par label).
 */
export interface Signer {
  /** Clé privée Starknet L2 (`0x` + hex). */
  l2PrivateKey: `0x${string}`;
  /** Adresse du compte Starknet L2 (`0x…`). */
  l2Address: `0x${string}`;
  network: Network;
  /** Subkey optionnelle (clé Stark à scope réduit : trading oui, retrait/transfert non). */
  subkeyPrivateKey?: `0x${string}`;
  /**
   * Adresse EVM **parente** (`0x…`), connue quand le compte L2 est dérivé d'une clé EVM
   * (cf. `signerFromEthKey`). Envoyée en header `PARADEX-ETHEREUM-ACCOUNT` à l'onboarding.
   */
  ethAddress?: `0x${string}`;
}

// ── Entrées (Params) — `kind` porté par le scope, pas dans les params ──
export interface CandlesParams {
  name: string;
  interval: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}
export interface OrderBookParams {
  name: string;
  limit?: number;
}
export interface TradesParams {
  name: string;
  limit?: number;
}
export interface FundingParams {
  name: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}
export interface SymbolParams {
  name: string;
}
export interface PlaceOrderParams {
  name: string;
  side: Side;
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket';
  size: string;
  price?: string;
  triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo';
  reduceOnly?: boolean;
  clientId?: string;
}
export interface CancelOrderParams {
  name: string;
  id?: string;
  clientId?: string;
}
export interface CancelAllParams {
  name?: string;
}
export interface EditOrderParams {
  name: string;
  id?: string;
  clientId?: string;
  side: Side;
  size: string;
  price?: string;
}
export interface LeverageParams {
  name: string;
  leverage: number;
}
export interface MarginModeParams {
  name: string;
  isolated: boolean;
}
/** Transfert Paradex : collatéral USDC vers un sous-compte (narrowing assumé). */
export interface TransferParams {
  to: { subAccount: string };
  amount: string;
}
export interface WithdrawParams {
  amount: string;
  address?: string;
  asset?: string;
  [extra: string]: unknown;
}

// ── Sorties (Output) unifiées ──
export interface Pair {
  name: string;
  base: string;
  quote: string;
  kind: MarketKind;
  szDecimals: number;
  maxLeverage?: number;
  tickSize?: string;
  stepSize?: string;
  minNotional?: string;
  status?: string;
  xtras?: Record<string, unknown>;
}
export interface Candle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
  kind: MarketKind;
  qv: string | null;
  tbbv: string | null;
  tbqv: string | null;
  xtras?: Record<string, unknown>;
}
export interface OrderBookLevel {
  price: string;
  size: string;
  n: number | null;
}
export interface OrderBook {
  name: string;
  kind: MarketKind;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  time: number | null;
  xtras?: Record<string, unknown>;
}
export interface Price {
  name: string;
  kind: MarketKind;
  mark: string | null;
  oracle: string | null;
  mid: string | null;
  bid: string | null;
  ask: string | null;
  last: string | null;
  funding: string | null;
  openInterest: string | null;
  volume24h: string | null;
  prevDayPrice: string | null;
  time: number | null;
  xtras?: Record<string, unknown>;
}
export interface FundingRate {
  name: string;
  fundingRate: string;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Trade {
  price: string;
  size: string;
  side: Side | null;
  maker: boolean | null;
  time: number;
  id: number | null;
  xtras?: Record<string, unknown>;
}
export interface Order {
  name: string;
  kind: MarketKind;
  id: string;
  clientId: string | null;
  side: Side;
  type:
    | 'limit'
    | 'market'
    | 'stop'
    | 'stopMarket'
    | 'takeProfit'
    | 'takeProfitMarket'
    | 'trailingStop'
    | 'other';
  price: string | null;
  size: string;
  filled: string;
  status: 'open' | 'partiallyFilled' | 'filled' | 'canceled' | 'rejected' | 'expired' | 'other';
  tif: 'gtc' | 'ioc' | 'fok' | 'alo' | null;
  reduceOnly: boolean | null;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Position {
  name: string;
  side: 'long' | 'short' | null;
  size: string;
  entryPrice: string | null;
  markPrice: string | null;
  unrealizedPnl: string | null;
  leverage: number | null;
  liquidationPrice: string | null;
  margin: string | null;
  xtras?: Record<string, unknown>;
}
export interface UserTrade {
  name: string;
  kind: MarketKind;
  id: string;
  orderId: string;
  side: Side;
  price: string;
  size: string;
  fee: string;
  feeAsset: string | null;
  pnl: string | null;
  maker: boolean | null;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Balance {
  asset: string;
  total: string;
  available: string | null;
  usdValue: string | null;
  xtras?: Record<string, unknown>;
}
export interface SubAccount {
  address: string;
  xtras?: Record<string, unknown>;
}
/** Accusé d'une écriture signée sans retour plus riche ; `xtras` = réponse native complète. */
export interface Ack {
  ok: boolean;
  xtras: Record<string, unknown>;
}
