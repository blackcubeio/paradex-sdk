import { describe, expect, it } from 'vitest';
import { Paradex } from '../src/index';

// Lectures publiques contre le **vrai mainnet** Paradex (aucun mock, aucune signature).
const dex = new Paradex();

describe('Paradex — lectures publiques (mainnet réel)', () => {
  it('getPairs renvoie des marchés perp', async () => {
    const perps = await dex.perp().getPairs();
    expect(perps.length).toBeGreaterThan(0);
    expect(perps.every((p) => p.kind === 'perp')).toBe(true);
    expect(perps.some((p) => p.name.endsWith('-PERP'))).toBe(true);
  });

  it('getPrices renvoie des prix marqués', async () => {
    const prices = await dex.perp().getPrices();
    expect(prices.length).toBeGreaterThan(0);
  });

  it('getOrderBook renvoie des niveaux pour BTC-USD-PERP', async () => {
    const book = await dex.perp().getOrderBook({ name: 'BTC-USD-PERP' });
    expect(book.name).toBe('BTC-USD-PERP');
    expect(book.bids.length + book.asks.length).toBeGreaterThan(0);
  });

  it('getTrades renvoie des trades publics', async () => {
    const trades = await dex.perp().getTrades({ name: 'BTC-USD-PERP', limit: 5 });
    expect(Array.isArray(trades)).toBe(true);
  });
});
