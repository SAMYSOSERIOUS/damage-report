import { serialToYMD } from '../excel';
import { geneCandidates } from '../genes';
import { MONTH_ABBR_EN } from '../months';
import type { Detector } from './common';
import { finding } from './common';

/** A mangled date that is saved and opened again becomes a five-digit number, for example 44076. */
export const geneNumber: Detector = {
  id: 'gene-number',
  run(ctx) {
    if (!ctx.profile.geneish) return [];
    const out = [];
    const { table, col } = ctx;
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      let serial: number | null = null;
      if (c.t === 'number' && c.num !== undefined && Number.isInteger(c.num)) serial = c.num;
      else if (c.t === 'text' && /^\d{5}$/.test(c.text)) serial = Number(c.text);
      if (serial === null || serial < 30000 || serial > 60000) continue;
      const { y, m, d } = serialToYMD(serial, table.date1904);
      const candidates = [...new Set([...geneCandidates([m], d), ...geneCandidates([m], y % 100)])];
      out.push(
        finding(
          ctx,
          i,
          'gene-number',
          'medium',
          `${c.text} is the number Excel uses for the date ${d} ${MONTH_ABBR_EN[m - 1]} ${y}. In a column of gene names that usually means a gene name was turned into a date and then into a number.`,
          candidates.length ? candidates.slice(0, 4).join(' or ') : undefined,
        ),
      );
    }
    return out;
  },
};
