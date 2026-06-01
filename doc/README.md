# @blackcube/paradex-sdk — Documentation

SDK TypeScript pour l'exchange **Paradex** — DEX de perpétuels (+ quelques marchés spot) sur une
**appchain Starknet** (Paradigm). Tout passe par la classe **`Paradex`** — voir le
[README](../README.md) pour la surface complète (scopes `perp`/`spot`/`account`/`transfers`/`ws`/
`wsSpot` + namespace `native`, REST vs WebSocket, exemples).

## Sommaire

- [README](../README.md) — la classe `Paradex`, les scopes, REST vs WebSocket, exemples.
- [Surface commune](./common.md) — le **contrat unifié** (identique sur les SDK Blackcube).
- [Surface native](./native.md) — les capacités **spécifiques à Paradex** (`dex.native.<cap>()` :
  `signing` / `subAccounts` / `perp` / `account`).
- [Signing](./signing.md) — signature **SNIP-12** (onboarding Starknet → JWT, hash d'ordre), courbe
  Stark en JS pur, **validée sur testnet réel**.
- [API-RESEARCH](./API-RESEARCH.md) — cartographie de l'API REST/WS Paradex (référence interne).

## Rappel : REST vs WebSocket

- **REST** (`perp()`, `spot()`, `account()`, `transfers()`) — **requête → réponse** : tu `await`, tu
  reçois une valeur.
- **WebSocket** (`ws()`, `wsSpot()`) — **abonnement → flux** (JSON-RPC 2.0) : un handler rappelé à
  chaque mise à jour, jusqu'au désabonnement. Socket ouvert au 1er `subscribe`, fermé au dernier
  `unsubscribe`.

Tous les retours sont au **format unifié Blackcube**, identique entre les SDK Aster / Hyperliquid /
Pacifica / Lighter / Extended / Paradex.
