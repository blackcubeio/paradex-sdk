// ── Surface publique du SDK Paradex ───────────────────────────────────────────
// Point d'entrée unique : la classe `Paradex`. Tout le reste (fonctions REST, client WS brut,
// signing SNIP-12, types natifs) est interne et n'est pas exporté.

/**
 * Façade : `new Paradex(signers, { default })` puis les scopes **réels** de la classe :
 * `.perp()` / `.spot()` (marché + trading + compte du produit), `.account()` (compte transverse +
 * kill-switch), `.transfers()` (transferts de fonds), `.ws()` / `.wsSpot()` (temps réel) et le
 * namespace `.native.<capacité>()` (surplus spécifique Paradex : `perp`/`spot` BBO, `account`
 * funding payments, `subAccounts`, `signing`).
 */
export { Paradex, type ParadexDexOptions } from './dex/paradex';

/** Contrat : interfaces de capacités + types d'entrée (Params) des méthodes. */
export type * from './dex/contract';

/** Interfaces **complémentaires** Paradex (surplus via `dex.native.<capacité>()`). */
export type * from './dex/native-contract';

/** Contexte d'exécution + helper `init` (lectures publiques sans façade) + options. */
export { init } from './common/config';
export type { InitOptions, ParadexClient } from './common/config';

/** Configuration d'un signer (passé au constructeur) et réseau. */
export type { Signer, Network } from './common/types';

/** Types **de sortie** unifiés renvoyés par les méthodes de la façade. */
export type {
  Balance,
  Candle,
  FundingRate,
  MarketKind,
  Order,
  OrderBook,
  OrderBookLevel,
  Pair,
  Position,
  Price,
  Side,
  SubAccount,
  Trade,
  UserTrade,
} from './common/types';

/** Types **de sortie** spécifiques au namespace `native` (cf. `doc/native.md`). */
export type { Ack } from './converters/ack';
export type { FundingPayment } from './converters/funding-payment';

/** Unsubscribe : valeur de retour des souscriptions WS. */
export type { Unsubscribe } from './common/ws';
