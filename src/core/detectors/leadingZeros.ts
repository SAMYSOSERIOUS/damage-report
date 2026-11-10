import type { Detector } from './common';
import { finding, wholeDigits } from './common';
import { gs1Valid, isbn10Valid } from '../checkdigits';

function mode(xs: number[]): { value: number; share: number } {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = xs[0];
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) ((best = v), (bestN = n));
  return { value: best, share: bestN / xs.length };
}

const GTIN_WIDTHS = [8, 12, 13, 14];

/**
 * Column of barcodes (GTIN) or ISBN-10 numbers. If most full-width values pass the check digit, then a shorter
 * value whose zero-padded form also passes it lost exactly those zeros.
 */
function barcodeProofs(items: { i: number; digits: string }[], table: { rows: { text: string }[][] }, col: number) {
  const out: { i: number; likely: string; why: string; same?: boolean }[] = [];
  const texts = table.rows.map((r) => r[col].text.trim());
  const count = (len: number, ok: (s: string) => boolean) => {
    const full = texts.filter((t) => t.length === len && /^\d+[\dXx]?$/.test(t));
    return { n: full.length, ok: full.filter(ok).length };
  };
  for (const w of GTIN_WIDTHS) {
    const c = count(w, gs1Valid);
    if (c.n < 5 || c.ok / c.n < 0.9) continue;
    for (const x of items) {
      if (x.digits.length >= w || x.digits.length < w - 3) continue;
      const padded = x.digits.padStart(w, '0');
      if (!gs1Valid(padded)) continue;
      if (gs1Valid(x.digits)) {
        // Valid at its own length too: a UPC-A is the same barcode as an EAN-13 that starts with 0. Not damage, but
        // the column is inconsistent, so offer the padded form as a choice.
        out.push({ i: x.i, likely: padded, same: true, why: `Most values here are ${w}-digit barcodes. "${x.digits}" is a valid shorter barcode, and it is the same barcode as "${padded}" (a leading zero does not change it). Padding makes the column consistent.` });
        continue;
      }
      out.push({ i: x.i, likely: padded, why: `Most values here are ${w}-digit barcodes that pass the barcode check digit. "${x.digits}" does not, but with ${w - x.digits.length} leading zero${w - x.digits.length > 1 ? 's' : ''} it does, so zeros were lost.` });
    }
    if (out.length) return out;
  }
  const isbn = count(10, isbn10Valid);
  if (isbn.n >= 5 && isbn.ok / isbn.n >= 0.9) {
    for (const x of items) {
      if (x.digits.length >= 10 || x.digits.length < 7) continue;
      const padded = x.digits.padStart(10, '0');
      if (!isbn10Valid(padded)) continue;
      out.push({ i: x.i, likely: padded, why: `Most values here are ISBN-10 numbers that pass the ISBN check digit. "${x.digits}" does not, but with ${10 - x.digits.length} leading zero${10 - x.digits.length > 1 ? 's' : ''} it does, so zeros were lost.` });
    }
  }
  return out;
}

/** ZIP codes, phone numbers and codes lose their leading zero: 01234 becomes 1234. */
export const leadingZeros: Detector = {
  id: 'leading-zeros',
  run(ctx) {
    const { table, col, profile } = ctx;
    const items: { i: number; digits: string }[] = [];
    for (let i = 0; i < table.rows.length; i++) {
      const d = wholeDigits(table.rows[i][col]);
      if (d !== null) items.push({ i, digits: d });
    }
    if (items.length < 3) return [];
    // The column must be made of digit strings. A text column that happens to hold a few all-digit entries
    // (movie titles such as "06" or "3") is not a code column.
    let nonEmpty = 0;
    for (const r of table.rows) if (r[col].t !== 'empty') nonEmpty++;
    if (items.length / nonEmpty < 0.8) return [];
    const out: ReturnType<typeof finding>[] = [];
    // Barcodes and ISBNs: the check digit proves which zeros were lost.
    const proofs = barcodeProofs(items, table, col);
    if (proofs.length) {
      for (const p of proofs) out.push({ ...finding(ctx, p.i, 'leading-zeros', p.same ? 'low' : 'high', p.why, p.likely), proof: p.same ? 'same barcode' : 'check digit' });
      return out;
    }
    const padded = items.filter((x) => x.digits.length > 1 && x.digits.startsWith('0'));
    if (padded.length >= 1) {
      const width = mode(padded.map((x) => x.digits.length)).value;
      const conf = padded.length >= 3 ? 'high' : 'medium';
      for (const x of items) {
        if (x.digits.startsWith('0') || x.digits.length >= width) continue;
        out.push(
          finding(
            ctx,
            x.i,
            'leading-zeros',
            conf,
            `Other values in this column are ${width} digits long and start with a zero. "${x.digits}" has ${x.digits.length}, so it probably lost ${width - x.digits.length} leading zero${width - x.digits.length > 1 ? 's' : ''}.`,
            '0'.repeat(width - x.digits.length) + x.digits,
          ),
        );
      }
      return out;
    }
    if (profile.zipLikeHeader || profile.phoneLikeHeader) {
      // Width = the longest length that is common (at least 25% of the column). Lost zeros make values SHORTER,
      // so the "most common" length can itself be a damaged one when many values began with zero.
      const counts = new Map<number, number>();
      for (const x of items) counts.set(x.digits.length, (counts.get(x.digits.length) ?? 0) + 1);
      let width = 0;
      for (const [len, n] of counts) if (n / items.length >= 0.25 && len > width) width = len;
      const near = items.filter((x) => x.digits.length <= width && x.digits.length >= width - 2).length;
      if (width < 4 || near / items.length < 0.9) return [];
      for (const x of items) {
        if (x.digits.length >= width) continue;
        out.push(
          finding(
            ctx,
            x.i,
            'leading-zeros',
            'medium',
            `This column looks like ${profile.zipLikeHeader ? 'postal codes' : 'phone numbers'}. A common length is ${width} digits and "${x.digits}" has ${x.digits.length}, so leading zeros may be missing.`,
            '0'.repeat(width - x.digits.length) + x.digits,
          ),
        );
      }
    }
    return out;
  },
};
