import { describe, expect, it } from 'vitest';
import { Paradex } from '../src/index';

// Surface publique : la classe Paradex et ses scopes. Aucun réseau.
const dex = new Paradex();

describe('Paradex — surface publique & scopes', () => {
  it('expose les scopes unifiés + le namespace native', () => {
    expect(typeof dex.perp).toBe('function');
    expect(typeof dex.spot).toBe('function');
    expect(typeof dex.account).toBe('function');
    expect(typeof dex.transfers).toBe('function');
    expect(typeof dex.ws).toBe('function');
    expect(typeof dex.wsSpot).toBe('function');
    for (const c of ['perp', 'spot', 'account', 'subAccounts', 'signing']) {
      expect(typeof (dex.native as Record<string, unknown>)[c]).toBe('function');
    }
    // `transfers` est COMMUN (top-level), pas dans native.
    expect((dex.native as Record<string, unknown>).transfers).toBeUndefined();
  });

  it('le scope perp implémente les capacités communes', () => {
    const perp = dex.perp();
    for (const m of [
      'getPairs',
      'getCandles',
      'getOrderBook',
      'getPrices',
      'getTrades',
      'place',
      'cancel',
      'cancelAll',
      'edit',
    ]) {
      expect(typeof (perp as unknown as Record<string, unknown>)[m]).toBe('function');
    }
  });

  it('account() expose le kill-switch (IDeadManSwitch)', () => {
    const account = dex.account();
    expect(typeof account.armCancelAll).toBe('function');
    expect(typeof account.disarm).toBe('function');
    expect(typeof account.withdraw).toBe('function');
    expect(typeof account.getBalances).toBe('function');
  });
});
