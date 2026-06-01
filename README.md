# @blackcube/paradex-sdk

SDK TypeScript pour **Paradex** — DEX de perpétuels sur une **appchain Starknet** (Paradigm).
Même surface que `@blackcube/hyperliquid-sdk`, `@blackcube/aster-sdk`, `@blackcube/pacifica-sdk` et
`@blackcube/lighter-sdk`.

> **SDK communautaire / non officiel.** Non affilié à Paradex. Usage à vos risques.

## Installation

```bash
pnpm add @blackcube/paradex-sdk
```

Node.js (≥ 22) et navigateur (signature SNIP-12 Stark en JS pur via `starknet` / `@noble`).

## Tout passe par la classe `Paradex`

Tu n'appelles jamais un endpoint REST ni un client WebSocket directement. Une seule classe
gère la connexion, la signature (SNIP-12 Stark + JWT), le réseau (mainnet/testnet) et la
conversion vers les types unifiés Blackcube.

```ts
import { Paradex } from '@blackcube/paradex-sdk';

// Lectures publiques (sans signer)
const pub = new Paradex();
const candles = await pub.perp().getCandles({ name: 'BTC-USD-PERP', interval: '1h', limit: 100 });

// Signé (compte Starknet L2)
const dex = new Paradex(
  { desk: { l2PrivateKey: '0x…', l2Address: '0x…', network: 'testnet' } },
  { default: 'desk' },
);
const order = await dex.perp().place({
  name: 'BTC-USD-PERP', side: 'buy', type: 'limit', size: '0.001', price: '50000', tif: 'gtc',
});

// WebSocket : abonnement → flux
const off = dex.ws().subscribeCandles({ name: 'BTC-USD-PERP', interval: '1m' }, (candle) => {
  console.log(candle.c);
});
off(); // se désabonne (ferme le socket s'il n'y a plus d'abonné)
```

## REST vs WebSocket — la seule distinction à connaître

- **REST** (`perp()`, `spot()`, `account()`, `transfers()`) : **requête → réponse**. Tu `await`
  un appel, tu reçois une valeur, terminé.
- **WebSocket** (`ws()`, `wsSpot()`) : **abonnement → flux**. Tu passes un *handler* rappelé
  **à chaque** mise à jour, tant que tu n'as pas appelé la fonction de désabonnement renvoyée.
  Pas de `connect()`/`disconnect()` : le socket s'ouvre au premier `subscribe` et se ferme
  seul quand le dernier abonnement est retiré.

Tous les retours (REST comme WS) sont au **format unifié** (`Candle`, `Order`, `OrderBook`,
`Position`, `Trade`, `UserTrade`, `Price`, `Balance`…), identique entre les SDK Blackcube.

## Construction

```ts
new Paradex(signers?, options?)
```

- **`signers`** : `Record<label, Signer>`. Un `Signer` Paradex =
  `{ l2PrivateKey, l2Address, network, subkeyPrivateKey?, ethAddress? }` — clé Stark **L2**
  (compte Starknet). `l2PrivateKey` signe (SNIP-12) et produit le JWT ; `l2Address` est l'adresse du
  compte lue par l'API. Sans signer, seules les lectures publiques fonctionnent.
- **`options.default`** : label utilisé quand tu n'en précises pas (sinon le premier signer).

Chaque scope accepte un `label` optionnel pour choisir le compte : `dex.perp('deskB')`,
`dex.account('deskB')`… Sans argument → signer par défaut. **Plusieurs instances `Paradex`
(comptes/réseaux différents) coexistent** sans interférence — chacune a sa propre config (pas de
singleton global).

## Deux produits, un `kind` porté par le scope

Paradex est surtout un DEX **perp** (`BASE-USD-PERP`, ex. `BTC-USD-PERP`), avec quelques marchés
**spot** (`BASE-USD`, ex. `ETH-USD`). Le **scope** (`perp()` vs `spot()`) porte le `kind` et l'annote
sur les retours.

### `dex.perp(label?)` / `dex.spot(label?)` — marché + trading + compte du produit

| Catégorie | Méthodes |
|---|---|
| Marché (public) | `getPairs()`, `getCandles(q)`, `getOrderBook(q)`, `getPrices()`, `getFundingHistory(q)`, `getTrades(q)`, `getExchangeInfo()` |
| Compte du produit (signé) | `getPositions(q?)`, `getOpens(q?)`, `getUserTrades(q?)`, `getAccountInfo()`, `getHistory(q?)` |
| Trading (signé) | `place(i)`, `cancel(i)`, `cancelAll(i)`, `edit(i)`, `updateLeverage(i)`, `setMarginMode(i)` |

> **Spécificités Paradex** (la surface unifiée n'expose que ce qui existe) :
> - `getCandles` exige une plage temporelle : sans `startTime`/`endTime`, le SDK borne les 24 dernières heures ;
> - `cancelAll` renvoie `{ cancelled: null }` (Paradex ne compte pas les ordres annulés) ;
> - `edit` resigne un `ModifyOrder`, **exige `id`** et ne renvoie que `{ name, id }` ;
> - pas d'`addIsolatedMargin` / `removeIsolatedMargin` dédiés (la marge isolée passe par `setMarginMode`).

### `dex.account(label?)` — compte transverse + kill-switch

`getBalances()`, `withdraw(i)` ; **kill-switch** `armCancelAll(ms)` / `disarm()` (Paradex l'offre
côté serveur via la méthode WS JSON-RPC `order.cancel_on_disconnect`).

> La **liste des sous-comptes** n'est pas dans le scope commun : `dex.native.subAccounts().getList()`.

> Paradex n'expose ni `ping` ni horloge serveur publics : **pas de scope `system()`**. Le compte est
> Starknet L2 : **pas de scope `helpers()`** (crypto EVM/Solana) — voir `signerFromEthKey` pour
> l'onboarding depuis une clé EVM.

### `dex.ws(label?)` (perp) / `dex.wsSpot(label?)` (spot) — temps réel

Chaque `subscribeX` renvoie une fonction de désabonnement (`Unsubscribe`). Les flux user-data
(`subscribeOrders`, `subscribeUserTrades`, `subscribePositions`) sont authentifiés (JWT).

| Catégorie | Méthodes |
|---|---|
| Public | `subscribeCandles(q, cb)`, `subscribeOrderBook(q, cb)`, `subscribeTrades(q, cb)`, `subscribeBbo(q, cb)` (→ `OrderBook` 1 niveau), `subscribePrices(cb)` (→ `Price[]`) |
| Compte (signé) | `subscribeOrders(cb)`, `subscribeUserTrades(cb)`, `subscribePositions(cb)` |

### `dex.transfers(label?)` — transferts de fonds (commun)

Modèle unifié `transfer({ to, amount })`. **Narrowing Paradex** : `to` doit être `{ subAccount }`
(collatéral USDC vers un sous-compte) — les routes `{ wallet }` / `{ account }` ne compilent pas.

### Surface `native` — spécifique Paradex (`dex.native.<cap>()`)

Le namespace `native` **miroite** le commun ; voir [`doc/native.md`](doc/native.md) pour le détail.
Toutes les méthodes ont des **I/O normalisés** : entrées en vocabulaire commun (`name`/`side`/`id`…),
sorties **typées** (types communs `OrderBook`/`SubAccount`, ou types nommés dédiés `FundingPayment`,
`Ack`… ; champs alignés sur le commun, natif complet dans `xtras`).

| Scope | Contenu |
|---|---|
| `dex.native.perp()` / `dex.native.spot()` | miroir natif de `perp()`/`spot()` : `getBbo` (BBO REST) |
| `dex.native.account()` | miroir natif de `account()` : `getFundingPayments` (paiements de funding du compte) |
| `dex.native.subAccounts()` | `getList` (transferts via `transfers()`) |
| `dex.native.signing()` | `onboard`, `getJwt` (onboarding Starknet + JWT) |

> Le **dead-man's switch** est commun : `dex.account().armCancelAll(ms)` / `disarm()`.

## Exemples

```ts
// Lecture publique sans signer
const pub = new Paradex();
const book = await pub.perp().getOrderBook({ name: 'BTC-USD-PERP', limit: 20 });

// Cycle d'ordre (testnet)
const created = await dex.perp().place({
  name: 'BTC-USD-PERP', side: 'buy', type: 'limit', tif: 'gtc', size: '0.001', price: '50000',
});
await dex.perp().cancel({ name: 'BTC-USD-PERP', id: created.id });

// Compte transverse
const balances = await dex.account().getBalances();

// Temps réel : suivre ses propres fills
const off = dex.ws().subscribeUserTrades((fill) => console.log(fill.price, fill.size));
```

## Spécificités Paradex

- **Auth** : onboarding Starknet → **JWT** (Bearer), signature des ordres en **SNIP-12** (typed data,
  courbe Stark, JS pur via `starknet`). Le `chainId` du domaine vient de `GET /system/config`.
- **WebSocket** en **JSON-RPC 2.0**. Kill-switch via `order.cancel_on_disconnect`.
- Marchés : `BASE-USD-PERP` (perp), `BASE-USD` (spot).

## Documentation

- Surface unifiée commune aux 5 SDK : [`doc/common.md`](doc/common.md).
- Surplus spécifique Paradex : [`doc/native.md`](doc/native.md).
- Signature SNIP-12 Stark + JWT : [`doc/signing.md`](doc/signing.md).

## License

BSD-3-Clause © Blackcube
