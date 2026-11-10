import months from '../../data/months.json';

/** Remove accents and lower-case, so that "Mär" and "mar" compare equal. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const tokenMonths = new Map<string, Set<number>>();
for (const names of Object.values(months.languages) as string[][]) {
  names.forEach((name, i) => {
    for (let k = 3; k <= name.length; k++) {
      const tok = name.slice(0, k);
      if (!tokenMonths.has(tok)) tokenMonths.set(tok, new Set());
      tokenMonths.get(tok)!.add(i + 1);
    }
  });
}
for (const [tok, m] of Object.entries(months.extraAbbreviations as Record<string, number>)) {
  if (!tokenMonths.has(tok)) tokenMonths.set(tok, new Set());
  tokenMonths.get(tok)!.add(m);
}

/** Month numbers (1-12) that a word could stand for in any supported language. Empty if it is not a month word. */
export function monthsFromToken(word: string): number[] {
  const tok = fold(word).replace(/\.$/, '');
  if (tok.length < 3) return [];
  const set = tokenMonths.get(tok);
  return set ? [...set].sort((a, b) => a - b) : [];
}

export const MONTH_ABBR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
