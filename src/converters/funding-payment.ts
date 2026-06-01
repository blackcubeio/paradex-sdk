/**
 * Paiement de funding **du compte** (`GET /funding/payments`) — distinct de l'historique de taux
 * public (`FundingRate`). Type nommé dédié (cf. `dex.native.account().getFundingPayments()`).
 */
export interface FundingPayment {
  /** Marché concerné. */
  name: string;
  /** Montant payé/reçu (chaîne décimale ; signe = sens). */
  payment: string;
  /** Index de funding au moment du paiement (null si absent). */
  fundingIndex: string | null;
  /** Horodatage (ms epoch). */
  time: number;
  /** Surplus natif (rien jeté). */
  xtras?: Record<string, unknown>;
}

/** Paiement de funding natif Paradex. */
export interface FundingPaymentNative {
  market?: string;
  payment?: string;
  fill_id?: string;
  index?: string;
  created_at?: number;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set(['market', 'payment', 'index', 'created_at']);

/** Convertisseur **bijectif** paiement de funding du compte. */
export class FundingPaymentConverter {
  toCommon(native: FundingPaymentNative): FundingPayment {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    const payment: FundingPayment = {
      name: native.market ?? '',
      payment: String(native.payment ?? '0'),
      fundingIndex: native.index !== undefined ? String(native.index) : null,
      time: native.created_at ?? 0,
    };
    if (Object.keys(xtras).length > 0) {
      payment.xtras = xtras;
    }
    return payment;
  }

  toNative(payment: FundingPayment): FundingPaymentNative {
    const xtras = (payment.xtras ?? {}) as Record<string, unknown>;
    const native: FundingPaymentNative = {
      ...xtras,
      market: payment.name,
      payment: payment.payment,
      created_at: payment.time,
    };
    if (payment.fundingIndex !== null) {
      native.index = payment.fundingIndex;
    }
    return native;
  }
}
