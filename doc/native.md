# Surface `native` — spécifique Paradex

Le surplus propre à Paradex (hors contrat commun) vit sous `dex.native.<capacité>()`. Le namespace
**miroite** les scopes communs (`native.perp()`, `native.account()`) et ajoute les capacités propres
(sous-comptes, signature). Convention partagée par les autres SDK Blackcube
(cf. mémoire `dex-native-convention`).

> I/O **normalisée** : entrées en vocabulaire commun (`name`…), sorties via types nommés
> (`OrderBook`, `FundingPayment`, `SubAccount`). `xtras` porte le natif hors cœur.

## `native.perp(label?)` / `native.spot(label?)` — `INativePerp`

Miroir natif de `perp()`/`spot()`.

| Méthode | Entrée | Sortie |
|---|---|---|
| `getBbo(q)` | `{ name }` | `Promise<OrderBook>` |

```ts
const bbo = await dex.native.perp().getBbo({ name: 'BTC-USD-PERP' });
// bbo.bids[0] = meilleure offre, bbo.asks[0] = meilleure demande (1 niveau, `GET /bbo/{m}`)
```

## `native.account(label?)` — `INativeAccount`

Miroir natif de `account()`.

| Méthode | Entrée | Sortie |
|---|---|---|
| `getFundingPayments(q)` | `{ name; limit? }` | `Promise<FundingPayment[]>` |

> `FundingPayment` (`name`, `payment`, `fundingIndex`, `time`, `xtras?`) = paiements de funding **du
> compte** (`GET /funding/payments`), distinct de l'historique de **taux** public `getFundingHistory()`
> (qui renvoie `FundingRate[]`).

## `native.subAccounts(label?)` — `INativeSubAccounts`

| Méthode | Entrée | Sortie |
|---|---|---|
| `list()` | — | `Promise<SubAccount[]>` |

```ts
const subs = await dex.native.subAccounts().list(); // GET /subaccounts
```

## `native.signing(label?)` — `ISigning`

Capacités de **signature / authentification** Paradex (cf. [`signing.md`](signing.md)).

| Méthode | Entrée | Sortie |
|---|---|---|
| `onboard()` | — | `Promise<void>` |
| `getJwt(expirationSeconds?)` | `number?` | `Promise<string>` |

```ts
await dex.native.signing().onboard();         // POST /onboarding (idempotent)
const jwt = await dex.native.signing().getJwt(); // Authorization: Bearer <jwt>
```

---

## Absences notables *(par rapport à d'autres SDK)*

- *(absent : Paradex)* `addIsolatedMargin` / `removeIsolatedMargin` explicites — la marge isolée se règle
  via `setMarginMode` + le moteur de marge serveur (à étendre si l'API expose un ajout/retrait dédié).
- *(absent : Paradex côté SDK pour l'instant)* vaults (`/vaults/*`), algos/TWAP, ordres batch
  (`/orders/batch`) — périphériques, reportés (cf. API-RESEARCH).
- *(absent : Paradex)* helpers crypto EVM/Solana — le compte est Starknet L2 (cf. signing.md).
