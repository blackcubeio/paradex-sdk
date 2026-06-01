# Surface commune (unifiée) — partagée par les 4 SDK Blackcube

Cette page décrit le **contrat unifié** partagé par `@blackcube/aster-sdk`, `@blackcube/hyperliquid-sdk`,
`@blackcube/pacifica-sdk` et `@blackcube/lighter-sdk`. L'**invariant** : mêmes **scopes**, mêmes **noms**,
même **vocabulaire** et mêmes **formes de types** (`…Params` en entrée, types de sortie communs) d'un SDK à
l'autre. Deux natures de **divergence assumée par conception**, toujours **annotées au cas par cas** dans les
tableaux/sections :

1. **Disponibilité par capacité** — un scope ou une méthode n'existe que si le DEX l'offre réellement
   (jamais de `throw « non supporté »` ; absences notées `*(absent : …)*`).
2. **Narrowing de type par DEX** — quand une venue n'accepte qu'une partie d'une entrée, le **type** est
   restreint à ce qu'elle supporte (le compilateur refuse le reste, aucun `throw` au runtime). Ex. : la/les
   route(s) de `transfer()`, ou le `type` d'ordre de `place()`. Cf. la section concernée.

> Les prix/quantités sont des **chaînes décimales** ; `xtras` porte le natif hors cœur (rien n'est jeté).

Le spécifique à Paradex est dans [`native.md`](native.md) ; la signature SNIP-12 / le JWT dans
[`signing.md`](signing.md).

## Construction

```ts
import { Paradex, type Signer } from '@blackcube/paradex-sdk';

const signer: Signer = {
  l2PrivateKey: '0x…', // clé Stark L2 (0x + 64 hex)
  l2Address: '0x…',    // adresse du compte Starknet L2
  network: 'testnet',  // le réseau est porté par le signer
};
const dex = new Paradex({ desk: signer }, { default: 'desk' });
// label absent → signer par défaut. Lectures publiques : new Paradex() suffit (sans signer).
```

`name` = symbole **Paradex** (ex. `BTC-USD-PERP`, `ETH-USD`). `interval` ∈ `1m/3m/5m/15m/30m/1h`.

---

## `perp(label?)` / `spot(label?)` — marché + trading + compte du produit
*(le `kind` perp/spot est porté par le scope ; Paradex est surtout un DEX perp, avec quelques marchés spot.)*

### Données de marché — `IMarketData`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getPairs()` | — | `Promise<Pair[]>` |
| `getCandles(q)` | `CandlesParams` | `Promise<Candle[]>` |
| `getOrderBook(q)` | `OrderBookParams` | `Promise<OrderBook>` |
| `getPrices()` | — | `Promise<Price[]>` |
| `getFundingHistory(q)` | `FundingParams` | `Promise<FundingRate[]>` |

```ts
const pairs = await dex.perp().getPairs();
const candles = await dex.perp().getCandles({ name: 'BTC-USD-PERP', interval: '5m' });
const book = await dex.perp().getOrderBook({ name: 'BTC-USD-PERP', limit: 20 });
const prices = await dex.perp().getPrices();
const funding = await dex.perp().getFundingHistory({ name: 'BTC-USD-PERP' });
```

> `getCandles` : Paradex exige une plage temporelle. Sans `startTime`/`endTime`, le SDK borne les
> **24 dernières heures**.

### Métadonnées — `IMarketMeta`
| Méthode | Sortie |
|---|---|
| `getExchangeInfo()` | `Promise<unknown>` *(brut volontaire : `GET /markets` complet)* |

### Trades publics — `IPublicTrades`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getTrades(q)` | `TradesParams` | `Promise<Trade[]>` |

### Trading — `ITrading`
| Méthode | Entrée | Sortie |
|---|---|---|
| `place(o)` | `PlaceOrderParams` | `Promise<Order>` |
| `cancel(o)` | `CancelOrderParams` | `Promise<void>` |
| `cancelAll(o)` | `CancelAllParams` | `Promise<{ cancelled: number \| null }>` |
| `edit(o)` | `EditOrderParams` | `Promise<{ name; id }>` |
| `updateLeverage(o)` | `LeverageParams` | `Promise<unknown>` |

```ts
const order = await dex.perp().place({
  name: 'BTC-USD-PERP', side: 'buy', type: 'limit', size: '0.001', price: '50000', tif: 'gtc',
});
await dex.perp().cancel({ name: 'BTC-USD-PERP', id: order.id });
await dex.perp().cancelAll({ name: 'BTC-USD-PERP' }); // `cancelled` toujours `null` (Paradex ne compte pas)
```

- `edit` resigne un `ModifyOrder` et **exige `id`** ; il ne renvoie que `{ name, id }` (relire via `getOpens`).
- `cancelAll` : `name` optionnel (omis = tous les marchés). Paradex ne renvoie pas de compteur → `null`.

### Mode de marge — `IMarginMode`
| Méthode | Entrée | Sortie |
|---|---|---|
| `setMarginMode(o)` | `MarginModeParams` | `Promise<void>` |

### Compte par produit — `IProductAccount`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getPositions(q?)` | `SymbolParams?` | `Promise<Position[]>` |
| `getOpens(q?)` | `SymbolParams?` | `Promise<Order[]>` |
| `getUserTrades(q?)` | `SymbolParams?` | `Promise<UserTrade[]>` |
| `getAccountInfo()` | — | `Promise<unknown>` *(brut : `GET /account`)* |

### Historique des ordres — `IOrderHistory`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getHistory(q?)` | `SymbolParams?` | `Promise<Order[]>` |

---

## `account(label?)` — compte transverse + kill-switch

| Méthode | Entrée | Sortie | Capacité |
|---|---|---|---|
| `getBalances()` | — | `Promise<Balance[]>` | `IAccount` |
| `withdraw(o)` | `WithdrawParams` | `Promise<Ack>` | `IAccount` |
| `getSubAccounts()` | — | `Promise<SubAccount[]>` *(absent du scope commun Paradex ; Paradex l'expose via `dex.native.subAccounts().getList()`)* | — |
| `armCancelAll(afterMs)` | `number` | `Promise<unknown>` | `IDeadManSwitch` |
| `disarm()` | — | `Promise<unknown>` | `IDeadManSwitch` |

> **Kill-switch** : Paradex l'implémente côté serveur via la méthode WS JSON-RPC
> `order.cancel_on_disconnect`. `armCancelAll(ms)` ouvre/authentifie la socket et arme le compte à rebours
> (à rafraîchir périodiquement). Jamais simulé côté client.

---

## `transfers(label?)` — transferts de fonds — `ITransfers`

| Méthode | Entrée | Sortie |
|---|---|---|
| `transfer(p)` | `TransferParams` | `Promise<unknown>` |

> **Narrowing Paradex** : `to` doit être `{ subAccount }` (collatéral USDC vers un sous-compte). Les autres
> routes (`{ wallet }`, `{ account }`) ne sont pas supportées. *(absent : transfert wallet↔wallet, vers un
> autre compte arbitraire.)*

---

## `ws(label?)` / `wsSpot(label?)` — temps réel

Lazy-connect au 1er `subscribe`, auto-close au dernier `unsubscribe`. Chaque méthode renvoie un
`Unsubscribe` (`() => void`).

| Méthode | Entrée | Callback | Capacité |
|---|---|---|---|
| `subscribeCandles(q, cb)` | `{ name; interval }` | `(Candle)` | `IRealtime` |
| `subscribeOrderBook(q, cb)` | `{ name }` | `(OrderBook)` | `IRealtime` |
| `subscribeTrades(q, cb)` | `{ name }` | `(Trade)` | `IRealtime` |
| `subscribeBbo(q, cb)` | `{ name }` | `(OrderBook)` | `IRealtime` |
| `subscribePrices(cb)` | — | `(Price[])` | `IRealtime` |
| `subscribeOrders(cb)` | — | `(Order)` | `IRealtime` *(auth)* |
| `subscribeUserTrades(cb)` | — | `(UserTrade)` | `IRealtime` *(auth)* |
| `subscribePositions(cb)` | — | `(Position)` | `IRealtimePositions` *(auth)* |

```ts
const off = dex.ws().subscribeTrades({ name: 'BTC-USD-PERP' }, (t) => console.log(t.price));
off();
```

> Robustesse interne (commune aux SDK) : reconnexion backoff exponentiel + jitter + cap, re-subscribe
> automatique, heartbeat + idle-timeout, rejet des requêtes en vol au close, parsing JSON défensif.

---

## Types — entrées (Params)

Les `startTime`/`endTime` sont des **datetime UTC** `"YYYY-MM-DD HH:MM:SS"` (C7). Le `kind` perp/spot
**n'est pas** dans les params : il est porté par le scope (`dex.perp()` / `dex.spot()`).

```ts
interface CandlesParams  { name: string; interval: string; startTime?: string; endTime?: string; limit?: number }
interface OrderBookParams{ name: string; limit?: number }
interface TradesParams   { name: string; limit?: number }
interface FundingParams  { name: string; startTime?: string; endTime?: string; limit?: number }
interface SymbolParams   { name: string }

interface PlaceOrderParams {
  name: string; side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket';
  size: string; price?: string; triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo'; reduceOnly?: boolean; clientId?: string;
}
interface CancelOrderParams { name: string; id?: string; clientId?: string }
interface CancelAllParams   { name?: string } // `name` omis = tous les marchés
interface EditOrderParams   { name: string; id?: string; clientId?: string; side: 'buy' | 'sell'; size: string; price?: string }
interface LeverageParams    { name: string; leverage: number }
interface MarginModeParams  { name: string; isolated: boolean }
// Narrowing Paradex : transfert de collatéral USDC vers un sous-compte uniquement.
interface TransferParams    { to: { subAccount: string }; amount: string }
interface WithdrawParams    { amount: string; address?: string; asset?: string; [extra: string]: unknown }
```

## Types — sorties (Output)

```ts
type Side = 'buy' | 'sell';
type MarketKind = 'perp' | 'spot';

interface Pair { name: string; base: string; quote: string; kind: MarketKind; szDecimals: number;
  maxLeverage?: number; tickSize?: string; stepSize?: string; minNotional?: string; status?: string; xtras?: Record<string, unknown> }

interface Candle { t: number; T: number; s: string; i: string; o: string; c: string; h: string; l: string;
  v: string; n: number; kind: MarketKind; qv: string | null; tbbv: string | null; tbqv: string | null; xtras?: Record<string, unknown> }

interface OrderBookLevel { price: string; size: string; n: number | null }
interface OrderBook { name: string; kind: MarketKind; bids: OrderBookLevel[]; asks: OrderBookLevel[]; time: number | null; xtras?: Record<string, unknown> }

interface Price { name: string; kind: MarketKind; mark: string | null; oracle: string | null; mid: string | null;
  bid: string | null; ask: string | null; last: string | null; funding: string | null; openInterest: string | null;
  volume24h: string | null; prevDayPrice: string | null; time: number | null; xtras?: Record<string, unknown> }

interface FundingRate { name: string; fundingRate: string; time: number; xtras?: Record<string, unknown> }

interface Trade { price: string; size: string; side: Side | null; maker: boolean | null; time: number; id: number | null; xtras?: Record<string, unknown> }

interface Order { name: string; kind: MarketKind; id: string; clientId: string | null; side: Side;
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket' | 'trailingStop' | 'other';
  price: string | null; size: string; filled: string;
  status: 'open' | 'partiallyFilled' | 'filled' | 'canceled' | 'rejected' | 'expired' | 'other';
  tif: 'gtc' | 'ioc' | 'fok' | 'alo' | null; reduceOnly: boolean | null; time: number; xtras?: Record<string, unknown> }

interface Position { name: string; side: 'long' | 'short' | null; size: string; entryPrice: string | null;
  markPrice: string | null; unrealizedPnl: string | null; leverage: number | null; liquidationPrice: string | null;
  margin: string | null; xtras?: Record<string, unknown> }

interface UserTrade { name: string; kind: MarketKind; id: string; orderId: string; side: Side; price: string; size: string;
  fee: string; feeAsset: string | null; pnl: string | null; maker: boolean | null; time: number; xtras?: Record<string, unknown> }

interface Balance { asset: string; total: string; available: string | null; usdValue: string | null; xtras?: Record<string, unknown> }

interface SubAccount { address: string; xtras?: Record<string, unknown> }

// Accusé d'une écriture signée sans retour plus riche (ex. `account().withdraw`) :
// `ok` = action acceptée ; `xtras` = réponse native complète (rien jeté).
interface Ack { ok: boolean; xtras: Record<string, unknown> }

type Unsubscribe = () => void;
```
