import data from '../data/genes.json';

interface Vulnerable {
  s: string;
  a: string;
  m: number[];
  n: number;
  /** c = current symbol, p = a previous official symbol, a = an alias. */
  k?: string;
}

const approved = new Set<string>(data.approved as string[]);
const byKey = new Map<string, Vulnerable[]>();
for (const v of data.vulnerable as Vulnerable[]) {
  for (const m of v.m) {
    const key = `${m}:${v.n}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(v);
  }
}

export function isGeneSymbol(s: string): boolean {
  return approved.has(s.trim().toUpperCase());
}

/** Gene symbols that Excel would turn into this month and number (day, or two-digit year). */
export function geneCandidates(months: number[], n: number): string[] {
  const bySymbol = new Map<string, string[]>();
  for (const o of geneOptions(months, n)) {
    const list = bySymbol.get(o.old) ?? [];
    if (!list.includes(o.current)) list.push(o.current);
    bySymbol.set(o.old, list);
  }
  return [...bySymbol].map(([old, cur]) => (cur.length === 1 && cur[0] === old ? old : `${old} (now ${cur.filter((c) => c !== old).join(' or ')})`));
}

export interface GeneOption {
  /** The symbol as typed (may be an old name such as SEPT2). */
  old: string;
  /** The approved symbol today (SEPTIN2). Equal to `old` when the name never changed. */
  current: string;
}

/** Same as geneCandidates, but structured, so the fix step can pick the old or the current name. */
export function geneOptions(months: number[], n: number): GeneOption[] {
  const out = new Map<string, GeneOption & { rank: number }>();
  for (const m of months) {
    for (const v of byKey.get(`${m}:${n}`) ?? []) {
      // The name itself first, then a name that was officially renamed, then mere aliases.
      const rank = v.s === v.a ? 0 : v.k === 'p' ? 1 : 2;
      out.set(`${v.s}|${v.a}`, { old: v.s, current: v.a, rank });
    }
  }
  return [...out.values()].sort((x, y) => x.rank - y.rank).map(({ old, current }) => ({ old, current }));
}

export const GENE_DATA_INFO = {
  approvedCount: approved.size,
  monthWordCount: (data.vulnerable as Vulnerable[]).length,
  source: data.source as { what: string; via: string; note: string },
};
