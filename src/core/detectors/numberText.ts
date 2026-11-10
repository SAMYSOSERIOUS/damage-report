import type { Ctx, Detector } from './common';
import { finding } from './common';

const PLAIN = /^[+-]?\d+(\.\d+)?$/;
const THOUSANDS_COMMA = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const THOUSANDS_SPACE = /^[+-]?\d{1,3}( \d{3})+$/;
const COMMA_DECIMAL = /^[+-]?\d+,\d{1,2}$/;

const EU_BOTH = /^[+-]?\d{1,3}(\.\d{3})+,\d+$/; // 1.234,56 can only be written this way
const EU_COMMA = /^[+-]?\d+,\d{1,2}$/; // 12,5 or 1234,56
const EU_THOUSANDS_ONLY = /^[+-]?\d{1,3}(\.\d{3})+$/; // 1.234 is ambiguous alone, fine inside an EU column

/**
 * A column written in the European style: 1.234,56 means 1234.56. The whole column votes: at least three values
 * that can only be European, and at least 80% of the column written that way. Then every such value is flagged.
 */
function europeanNumbers(ctx: Ctx) {
  const { table, col } = ctx;
  let nonEmpty = 0;
  let sure = 0;
  let fit = 0;
  for (const r of table.rows) {
    const c = r[col];
    if (c.t === 'empty') continue;
    nonEmpty++;
    if (c.t !== 'text') continue;
    const t = c.text.trim();
    if (EU_BOTH.test(t)) {
      sure++;
      fit++;
    } else if (EU_COMMA.test(t) || EU_THOUSANDS_ONLY.test(t)) fit++;
  }
  if (nonEmpty < 5 || sure < 3 || fit / nonEmpty < 0.8) return null;
  const out = [];
  for (let i = 0; i < table.rows.length; i++) {
    const c = table.rows[i][col];
    if (c.t !== 'text') continue;
    const t = c.text.trim();
    if (!(EU_BOTH.test(t) || EU_COMMA.test(t) || EU_THOUSANDS_ONLY.test(t))) continue;
    const plain = t.replace(/\./g, '').replace(',', '.');
    out.push({
      ...finding(
        ctx,
        i,
        'number-text',
        table.source === 'xlsx' ? 'medium' : 'low',
        `This column writes numbers the European way (${sure} values such as "${table.rows.find((r) => EU_BOTH.test(r[col].text.trim()))![col].text.trim()}"), so "${t}" means ${plain}. Software that expects 1,234.56 reads it as text or as a wrong number.`,
        plain,
      ),
      proof: 'column vote',
    });
  }
  return out;
}

/** Numbers saved as text, with stray spaces or thousands separators, in an otherwise numeric column. */
export const numberText: Detector = {
  id: 'number-text',
  run(ctx) {
    const { table, col } = ctx;
    let strict = 0; // cells that are plainly numbers
    let numericLike = 0; // plain numbers plus cells that become numbers once spaces or separators are removed
    let nonEmpty = 0;
    let commaDecimals = 0;
    let realNumbers = 0;
    for (const row of table.rows) {
      const c = row[col];
      if (c.t === 'empty') continue;
      nonEmpty++;
      if (c.t === 'number') realNumbers++;
      if (c.t === 'number' || (c.t === 'text' && PLAIN.test(c.text))) {
        strict++;
        numericLike++;
      } else if (c.t === 'text') {
        const trimmed = c.text.replace(/[\u00A0\s]+/g, ' ').trim();
        if (PLAIN.test(trimmed) || THOUSANDS_COMMA.test(trimmed) || THOUSANDS_SPACE.test(trimmed)) numericLike++;
      }
      if (c.t === 'text' && COMMA_DECIMAL.test(c.text)) commaDecimals++;
    }
    const euOut = europeanNumbers(ctx);
    if (euOut) return euOut;
    // Mostly plain numbers, and almost everything else in the column is also a number in disguise.
    if (nonEmpty < 5 || strict / nonEmpty < 0.5 || numericLike / nonEmpty < 0.8) return [];
    const out = [];
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      if (c.t !== 'text') continue;
      const trimmed = c.text.replace(/[ \s]+/g, ' ').trim();
      if (trimmed !== c.text && PLAIN.test(trimmed)) {
        out.push(
          finding(
            ctx,
            i,
            'number-text',
            table.source === 'xlsx' ? 'medium' : 'low',
            'This value is a number with extra spaces around it, so software will read it as text and skip it in calculations.',
            trimmed,
          ),
        );
      } else if (commaDecimals === 0 && (THOUSANDS_COMMA.test(c.text) || THOUSANDS_SPACE.test(c.text))) {
        out.push(
          finding(
            ctx,
            i,
            'number-text',
            'low',
            'This number uses a thousands separator while the other values in the column do not, so it will be read as text.',
            c.text.replace(/[, ]/g, ''),
          ),
        );
      } else if (
        table.source === 'xlsx' &&
        realNumbers / nonEmpty >= 0.5 &&
        PLAIN.test(c.text) &&
        !/^0\d/.test(c.text) &&
        !ctx.profile.idLikeHeader &&
        !ctx.profile.zipLikeHeader &&
        !ctx.profile.phoneLikeHeader &&
        !/^\d{10,}$/.test(c.text)
      ) {
        out.push(
          finding(
            ctx,
            i,
            'number-text',
            'medium',
            'This number is stored as text in an Excel column where the other cells are real numbers. It will be ignored by sums and averages.',
            c.text,
          ),
        );
      }
    }
    return out;
  },
};
