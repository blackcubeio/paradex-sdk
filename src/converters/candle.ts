import type { Candle, MarketKind } from '../common/types';

/**
 * Bougie native Paradex (`GET /markets/klines`). La réponse est un **tableau positionnel**
 * `[t, o, h, l, c, v]` (epoch ms d'ouverture + OHLC + volume) — **confirmé sur mainnet réel**
 * (lectures publiques 2026-06-01, perp ETH/BTC).
 */
export type KlineNative = [number, number, number, number, number, number, ...unknown[]];

/**
 * Convertisseur **bijectif** bougie. Paradex ne fournit ni quote/taker volumes ni nombre de trades
 * dans la kline → `qv`/`tbbv`/`tbqv`/`n` neutres. La résolution (intervalle) et le `kind` sont
 * portés par le convertisseur. La fin de bougie `T` est calculée depuis `intervalMs`.
 */
export class CandleConverter {
  constructor(
    private readonly name: string,
    private readonly interval: string,
    private readonly kind: MarketKind,
    private readonly intervalMs: number,
  ) {}

  toCommon(wire: KlineNative): Candle {
    const [t, o, h, l, c, v] = wire;
    const candle: Candle = {
      t,
      T: t + this.intervalMs - 1,
      s: this.name,
      i: this.interval,
      o: String(o),
      c: String(c),
      h: String(h),
      l: String(l),
      v: String(v),
      n: 0,
      kind: this.kind,
      qv: null,
      tbbv: null,
      tbqv: null,
    };
    // Colonnes supplémentaires éventuelles (au-delà de v) conservées brutes.
    if (wire.length > 6) {
      candle.xtras = { extra: wire.slice(6) };
    }
    return candle;
  }

  toNative(candle: Candle): KlineNative {
    return [
      candle.t,
      Number(candle.o),
      Number(candle.h),
      Number(candle.l),
      Number(candle.c),
      Number(candle.v),
    ];
  }
}
