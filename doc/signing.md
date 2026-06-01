# Signature & authentification — Paradex (SNIP-12 Stark + JWT)

Paradex est un perp DEX sur **appchain Starknet**. Les écritures sont signées en **SNIP-12** (typed data
Starknet) avec la **clé Stark L2** du compte, en **JS pur** (`starknet` : `typedData.getMessageHash` +
`ec.starkCurve.sign`) — **pas de WASM**. L'accès aux endpoints privés se fait via un **JWT** obtenu en
signant une requête d'auth.

> ⚠️ **À VALIDER SUR TESTNET.** La mécanique cryptographique locale (hash SNIP-12 déterministe + signature
> Stark) est testée (`tests/signing.test.ts`), et les **lectures publiques** sont validées sur mainnet réel.
> En revanche, la conformité des **messages typés** au serveur Paradex (signature *acceptée* pour onboarding
> / auth / ordre) **n'a pas pu être confrontée** au serveur faute de credentials. Ne pas considérer la
> signature comme prouvée tant qu'un ordre testnet n'a pas été accepté.

## Le signer

```ts
import type { Signer } from '@blackcube/paradex-sdk';

const signer: Signer = {
  l2PrivateKey: '0x…', // clé privée Stark L2 (0x + 64 hex)
  l2Address: '0x…',    // adresse du compte Starknet L2
  network: 'testnet',  // 'mainnet' | 'testnet' — porté par le signer
  // subkeyPrivateKey?: '0x…' // optionnel : subkey à scope réduit (trading oui, retrait non)
};
```

- La clé L2 est soit fournie directement par Paradex, soit dérivée d'une signature Ethereum (`grind_key`)
  — la **dérivation L1→L2 n'est pas dans ce SDK** (fournir directement `l2PrivateKey`/`l2Address`).
- Si `subkeyPrivateKey` est présent, il signe **les ordres** (pas les transferts/retraits, qui restent sur
  la clé principale).

## Domaine SNIP-12

```
{ name: "Paradex", chainId, version: "1" }
```

Le `chainId` SNIP-12 = encodage **short-string** de `starknet_chain_id`, lu via `GET /system/config`
(**jamais hardcodé**, caché par réseau dans le client). Valeur mainnet confirmée :
`PRIVATE_SN_PARACLEAR_MAINNET`. Le calcul est `shortString.encodeShortString(starknet_chain_id)` (= entier
des octets ASCII, rendu en hex).

## Messages typés

| Usage | `primaryType` | Champs du message |
|---|---|---|
| Onboarding (`POST /onboarding`) | `Constant` | `{ action: "Onboarding" }` |
| Auth / JWT (`POST /auth`) | `Request` | `{ method, path:"/v1/auth", body:"", timestamp, expiration }` |
| Ordre (`POST /orders`) | `Order` | `[timestamp, market, side, orderType, size, price]` |
| Modification (`PUT /orders/{id}`) | `ModifyOrder` | `Order` + `id` |

- `side` = `1` (BUY) / `2` (SELL) ; `size`/`price` **quantifiés à 8 décimales** ; `price = 0` à la
  signature d'un MARKET ; `timestamp` (ms epoch) sert de **nonce** (= `signature_timestamp` du body).
- `timestamp`/`expiration` de l'auth sont en **secondes** epoch (expiration défaut 30 min, max ~1 semaine).
- La signature est sérialisée en `"[r, s]"` (champ `signature` du body / header `PARADEX-STARKNET-SIGNATURE`).

## Flux JWT

```ts
// Manuel (scope native) :
await dex.native.signing().onboard();             // une fois (idempotent)
const jwt = await dex.native.signing().getJwt();  // Authorization: Bearer <jwt>
```

En interne, **toute lecture privée / écriture** appelle `getJwt()` automatiquement (cache par label,
renouvelé ~60 s avant expiration) et joint `Authorization: Bearer <jwt>`. Les headers d'onboarding/auth
(`PARADEX-STARKNET-ACCOUNT`, `PARADEX-STARKNET-SIGNATURE`, `PARADEX-TIMESTAMP`,
`PARADEX-SIGNATURE-EXPIRATION`) sont posés par le SDK.

## WebSocket

L'auth WS se fait via la méthode JSON-RPC `auth` (`{ method:'auth', params:{ bearer } }`) émise en premier
et **réémise après reconnexion**. Le kill-switch `order.cancel_on_disconnect` passe par cette même socket.

## Points restant à valider testnet

- `starknet_chain_id` **testnet** + acceptation de la signature par le serveur (onboarding/auth/ordre).
- Sérialisation exacte de la signature (`"[r,s]"` vs tableau JSON) selon la version d'API.
- Routes/signature de `/transfers` (transfert sous-compte, retrait L1).
