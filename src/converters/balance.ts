import type { Balance } from '../common/types';

/** Solde natif Paradex (`GET /balance`). */
export interface BalanceNative {
  token?: string;
  size?: string;
  available_balance?: string;
  last_updated_at?: number;
  [key: string]: unknown;
}

const CORE: ReadonlySet<string> = new Set(['token', 'size', 'available_balance']);

const s = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

/**
 * Convertisseur **bijectif** solde. `total` = `size`, `available` = `available_balance`. Paradex
 * étant collatéralisé en USDC, `usdValue` n'est pas fourni distinctement (→ `null`). Surplus `xtras`.
 */
export class BalanceConverter {
  toCommon(native: BalanceNative): Balance {
    const xtras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(native)) {
      if (!CORE.has(k)) {
        xtras[k] = v;
      }
    }
    const balance: Balance = {
      asset: native.token ?? 'USDC',
      total: String(native.size ?? '0'),
      available: s(native.available_balance),
      usdValue: null,
    };
    if (Object.keys(xtras).length > 0) {
      balance.xtras = xtras;
    }
    return balance;
  }

  toNative(balance: Balance): BalanceNative {
    const xtras = (balance.xtras ?? {}) as Record<string, unknown>;
    const native: BalanceNative = { ...xtras, token: balance.asset, size: balance.total };
    if (balance.available !== null) {
      native.available_balance = balance.available;
    }
    return native;
  }
}
