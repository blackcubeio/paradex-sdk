import type { FundingPayment } from '../converters/funding-payment';

/**
 * Interfaces **complémentaires Paradex** : le surplus spécifique au DEX, exposé via
 * `dex.native.<capacité>()`. Le namespace `native` **miroite** les scopes communs (`native.perp()`,
 * `native.account()`) et ajoute les capacités propres (sous-comptes, signing). Convention partagée
 * par les 4 autres SDK (`dex-native-convention`).
 */

/** Surplus **marché perp** (miroir natif de `perp()`) : BBO REST. */
export interface INativePerp {
  /** Meilleure limite (BBO) en REST (`GET /bbo/{m}`), forme {@link import('../common/types').OrderBook}. */
  getBbo(query: { name: string }): Promise<import('../common/types').OrderBook>;
}

/** Surplus **compte** (miroir natif de `account()`) : paiements de funding du compte. */
export interface INativeAccount {
  /** Paiements de funding **du compte** (`GET /funding/payments`) — distinct du taux public. */
  getFundingPayments(query: { name: string; limit?: number }): Promise<FundingPayment[]>;
}

/** Gestion des **sous-comptes** Paradex (`/subaccounts`, `on_behalf_of_account`). */
export interface INativeSubAccounts {
  /** Liste des sous-comptes (forme {@link import('../common/types').SubAccount}). */
  list(): Promise<import('../common/types').SubAccount[]>;
}

/** Capacités **signature / auth** Paradex (SNIP-12 + JWT). */
export interface ISigning {
  /** Enregistre le compte (idempotent) — `POST /onboarding`. */
  onboard(): Promise<void>;
  /** Produit (ou réutilise) un JWT (`Authorization: Bearer`). */
  getJwt(expirationSeconds?: number): Promise<string>;
}

export type { FundingPayment };
