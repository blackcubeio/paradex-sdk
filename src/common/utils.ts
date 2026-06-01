/** Convertit un datetime unifié `YYYY-MM-DD HH:MM:SS` (UTC) en millisecondes epoch. */
export function dateToMs(date: string): number {
  return new Date(`${date.replace(' ', 'T')}Z`).getTime();
}

/** Convertit des millisecondes epoch en datetime unifié `YYYY-MM-DD HH:MM:SS` (UTC). */
export function msToDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Convertit une valeur décimale (string) en **quantum entier** (BigInt) sur `decimals` décimales.
 * Paradex signe les ordres avec `size`/`price` quantifiés à 8 décimales (SNIP-12).
 */
export function toQuantum(value: string, decimals: number): bigint {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const frac = `${fracPart}${'0'.repeat(decimals)}`.slice(0, decimals);
  const q = BigInt(`${intPart}${frac}`);
  return negative ? -q : q;
}
