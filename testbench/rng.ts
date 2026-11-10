/** Small seeded random number generator (mulberry32) so every bench run is reproducible. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  const chance = (p: number) => next() < p;
  const shuffle = <T>(xs: T[]): T[] => {
    const out = xs.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const digits = (n: number, firstNonZero = true) => {
    let s = '';
    for (let i = 0; i < n; i++) s += i === 0 && firstNonZero ? int(1, 9) : int(0, 9);
    return s;
  };
  return { next, int, pick, chance, shuffle, digits };
}
export type Rng = ReturnType<typeof makeRng>;
