import type { Detector } from './common';
import { finding } from './common';
import { columnUsesLuhn, luhnValid } from '../checkdigits';

const SCI = /^[+-]?(\d)(?:\.(\d+))?[eE]\+?(\d{1,3})$/;

/** Excel keeps 15 digits. Longer IDs show as 1.23457E+15 and the rest of the digits are gone. */
export const longId: Detector = {
  id: 'long-id',
  run(ctx) {
    const out = [];
    const { table, col, profile } = ctx;
    const idContext = profile.idLikeHeader || profile.longDigitCells >= 1;
    let longCells = 0;
    let cutCount = 0;
    for (const row of table.rows) {
      const t = row[col].text.trim();
      if (row[col].t !== 'text' && row[col].t !== 'number') continue;
      if (/^\d{16,19}$/.test(t)) {
        longCells++;
        if (/0*$/.exec(t)![0].length >= t.length - 15) cutCount++;
      }
    }
    const cutShare = longCells ? cutCount / longCells : 0;
    const expectedByChance = longCells * 0.1;
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      if (c.t !== 'text' && c.t !== 'number') continue;
      const s = c.text.trim();
      const sci = SCI.exec(s);
      if (sci) {
        const exp = Number(sci[3]);
        const mantissaDigits = 1 + (sci[2]?.length ?? 0);
        if (exp >= 11 && mantissaDigits >= 3 && mantissaDigits <= 15) {
          if (idContext) {
            out.push(
              finding(
                ctx,
                i,
                'long-id',
                'high',
                `"${s}" is a ${exp + 1}-digit number written in scientific notation. Only the first ${mantissaDigits} digits survive, so this ID has lost its remaining digits. They cannot be recovered from this file.`,
                'Look up the original ID in the source system.',
              ),
            );
          } else if (mantissaDigits >= 5) {
            out.push(
              finding(
                ctx,
                i,
                'long-id',
                'medium',
                `"${s}" is a ${exp + 1}-digit number in scientific notation. If this is an ID or code, digits beyond the first ${mantissaDigits} are lost.`,
              ),
            );
          }
        }
        continue;
      }
      if (/^\d{16,19}$/.test(s)) {
        // A value that passes the column's own check digit is a real, intact ID, even if it ends in a zero.
        if (luhnValid(s) && columnUsesLuhn(table, col, s.length)) continue;
        const zeros = /0*$/.exec(s)![0].length;
        const need = s.length - 15;
        if (zeros < need) continue;
        // A genuine 16-digit ID ends in a zero 1 time in 10, so one trailing zero alone proves little.
        // Trust it when much of the column looks cut, or when there are more zeros than chance explains.
        const excess = zeros - need;
        const strong = excess >= 2 || cutShare >= 0.5 || (cutCount >= 3 && cutCount >= 3 * expectedByChance);
        if (!strong && !idContext) continue;
        out.push(
          finding(
            ctx,
            i,
            'long-id',
            strong ? (idContext ? 'high' : 'medium') : 'low',
            `"${s}" has ${s.length} digits and ${zeros === 1 ? 'its last digit is a zero' : `its last ${zeros} digits are zeros`}. Excel keeps only 15 digits and fills the rest with zeros, so the real ending is ${strong ? 'probably' : 'possibly'} lost.${strong ? '' : ' (One trailing zero happens by chance in about 1 of 10 real IDs, so this is only a hint.)'}`,
            'Look up the original ID in the source system.',
          ),
        );
      }
    }
    return out;
  },
};
