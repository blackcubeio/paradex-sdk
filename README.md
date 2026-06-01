# @blackcube/paradex-sdk

SDK TypeScript pour **Paradex** — DEX de perpétuels sur une **appchain Starknet** (Paradigm).

> 🚧 **En construction** sur le moule des SDK DEX Blackcube (Hyperliquid / Aster / Pacifica / Lighter).
> Voir [`docs/blackcube/PLAYBOOK-SDK.md`](../docs/blackcube/PLAYBOOK-SDK.md) (racine Web3) pour le modèle,
> et [`doc/API-RESEARCH.md`](doc/API-RESEARCH.md) pour la cartographie de l'API Paradex.

## Tout passe par la classe `Paradex`

```ts
import { Paradex } from '@blackcube/paradex-sdk';

// Lectures publiques (sans signer)
const dex = new Paradex();
await dex.perp().getPairs();
await dex.perp().getCandles({ name: 'BTC-USD-PERP', interval: '1h', limit: 100 });

// Signé (compte Starknet L2)
const signed = new Paradex(
  { desk: { l2PrivateKey: '0x…', l2Address: '0x…', network: 'mainnet' } },
  { default: 'desk' },
);
await signed.account().getPositions();
await signed.perp().place({ name: 'BTC-USD-PERP', side: 'buy', type: 'limit', size: '0.001', price: '30000', tif: 'gtc' });
```

## Surface

- **Commun** (portable, identique aux autres SDK) : `perp()` / `account()` / `transfers()` / `ws()`.
- **Natif** (spécifique Paradex) : `native.<capacité>()` (sous-comptes, vaults, algos, …).

## Spécificités Paradex

- **Auth** : onboarding Starknet → **JWT** (Bearer), signature des ordres en **SNIP-12** (typed data,
  courbe Stark, JS pur via `starknet`). Le `chainId` du domaine vient de `GET /system/config`.
- **WebSocket** en **JSON-RPC 2.0**. Kill-switch via `order.cancel_on_disconnect`.
- Marchés : `BASE-USD-PERP` (perp), `BASE-USD` (spot).

## Licence
BSD-3-Clause — Blackcube.
