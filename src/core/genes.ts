import data from '../data/genes.json';

interface Vulnerable {
  s: string;
  a: string;
  m: number[];
  n: number;
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
  const out = new Map<string, string>();
  for (const m of months) {
    for (const v of byKey.get(`${m}:${n}`) ?? []) {
      out.set(v.s, v.s === v.a ? v.s : `${v.s} (now ${v.a})`);
    }
  }
  return [...out.values()];
}

export interface GeneOption {
  /** The symbol as typed (may be an old name such as SEPT2). */
  old: string;
  /** The approved symbol today (SEPTIN2). Equal to `old` when the name never changed. */
  current: string;
}

/** Same as geneCandidates, but structured, so the fix step can pick the old or the current name. */
export function geneOptions(months: number[], n: number): GeneOption[] {
  const out = new Map<string, GeneOption>();
  for (const m of months) {
    for (const v of byKey.get(`${m}:${n}`) ?? []) out.set(`${v.s}|${v.a}`, { old: v.s, current: v.a });
  }
  return [...out.values()];
}

export const GENE_DATA_INFO = {
  approvedCount: approved.size,
  monthWordCount: (data.vulnerable as Vulnerable[]).length,
  source: data.source as { what: string; via: string; note: string },
};
