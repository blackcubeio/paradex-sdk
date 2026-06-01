import { describe, expect, it } from 'vitest';
import { BalanceConverter } from '../src/converters/balance';
import { OrderConverter } from '../src/converters/order';
import { type MarketNative, PairConverter } from '../src/converters/pair';
import { PositionConverter } from '../src/converters/position';
import { TradeConverter } from '../src/converters/trade';

// Bijection des converters : toNative(toCommon(x)) doit restituer les champs-cœur (rien jeté).

describe('Converters — bijection cœur', () => {
  it('pair : cœur + xtras restitués', () => {
    const native: MarketNative = {
      symbol: 'ETH-USD-PERP',
      base_currency: 'ETH',
      quote_currency: 'USD',
      asset_kind: 'PERP',
      order_size_increment: '0.001',
      price_tick_size: '0.1',
      min_notional: '10',
      max_open_orders: 50,
    };
    const c = new PairConverter();
    const common = c.toCommon(native);
    expect(common.name).toBe('ETH-USD-PERP');
    expect(common.kind).toBe('perp');
    expect(common.szDecimals).toBe(3);
    const back = c.toNative(common);
    expect(back.symbol).toBe(native.symbol);
    expect(back.max_open_orders).toBe(50); // surplus restitué depuis xtras
  });

  it('order : filled dérivé, type/status/tif mappés', () => {
    const c = new OrderConverter('perp');
    const common = c.toCommon({
      id: '123',
      client_id: 'abc',
      market: 'BTC-USD-PERP',
      side: 'BUY',
      type: 'LIMIT',
      size: '2',
      remaining_size: '0.5',
      price: '50000',
      instruction: 'POST_ONLY',
      status: 'OPEN',
      flags: ['REDUCE_ONLY'],
      created_at: 1000,
    });
    expect(common.filled).toBe('1.5');
    expect(common.type).toBe('limit');
    expect(common.tif).toBe('alo');
    expect(common.status).toBe('open');
    expect(common.reduceOnly).toBe(true);
    expect(c.toNative(common).id).toBe('123');
  });

  it('position : side depuis signe, taille absolue', () => {
    const c = new PositionConverter();
    const common = c.toCommon({ market: 'ETH-USD-PERP', size: '-3', average_entry_price: '2000' });
    expect(common.side).toBe('short');
    expect(common.size).toBe('3');
    expect(c.toNative(common).size).toBe('-3');
  });

  it('balance : total/available', () => {
    const c = new BalanceConverter();
    const common = c.toCommon({ token: 'USDC', size: '100', available_balance: '80' });
    expect(common.total).toBe('100');
    expect(common.available).toBe('80');
    expect(c.toNative(common).size).toBe('100');
  });

  it('trade : side taker, id conservé', () => {
    const c = new TradeConverter();
    const common = c.toCommon({ id: '42', price: '10', size: '1', side: 'SELL', created_at: 5 });
    expect(common.side).toBe('sell');
    expect(common.id).toBe(42);
    expect(c.toNative(common).side).toBe('SELL');
  });
});
