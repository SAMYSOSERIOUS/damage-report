import type { Detector } from './common';
import { finding } from './common';

const DATE = /^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})$/;

/** A column that mixes day/month and month/day dates is damaged. A column where every date fits both is only a warning. */
export const mixedDates: Detector = {
  id: 'mixed-dates',
  run(ctx) {
    const { table, col } = ctx;
    interface D {
      i: number;
      a: number;
      b: number;
    }
    const dates: D[] = [];
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      if (c.t !== 'text') continue;
      const m = DATE.exec(c.text.trim());
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[3]);
      if (a < 1 || b < 1 || a > 31 || b > 31 || (a > 12 && b > 12)) continue;
      dates.push({ i, a, b });
    }
    if (dates.length < 5) return [];
    const dayFirst = dates.filter((d) => d.a > 12);
    const monthFirst = dates.filter((d) => d.b > 12);
    const ambiguous = dates.filter((d) => d.a <= 12 && d.b <= 12 && d.a !== d.b);
    const out = [];
    if (dayFirst.length > 0 && monthFirst.length > 0) {
      const minority = dayFirst.length >= monthFirst.length ? monthFirst : dayFirst;
      const minorityName = minority === monthFirst ? 'month/day' : 'day/month';
      const majorityName = minority === monthFirst ? 'day/month' : 'month/day';
      const majorityCount = (minority === monthFirst ? dayFirst : monthFirst).length;
      for (const d of minority) {
        out.push(
          finding(
            ctx,
            d.i,
            'mixed-dates',
            'high',
            `This date can only be ${minorityName} (a part is above 12), but ${majorityCount} other date${majorityCount > 1 ? 's' : ''} in this column can only be ${majorityName}. The column mixes two date orders.${ambiguous.length ? ` ${ambiguous.length} more date${ambiguous.length === 1 ? ' is' : 's are'} impossible to read safely.` : ''}`,
          ),
        );
      }
    } else if (dayFirst.length === 0 && monthFirst.length === 0 && ambiguous.length >= 5) {
      out.push(
        finding(
          ctx,
          ambiguous[0].i,
          'mixed-dates',
          'info',
          `All ${dates.length} dates in this column could be read day/month or month/day. This is not damage by itself. Check which order the source used before you analyse them.`,
        ),
      );
    }
    return out;
  },
};
