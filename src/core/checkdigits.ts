/** Check digits. A last digit worked out from the others lets us prove a repair instead of guessing it. */

/** GS1 (EAN-8, UPC-A, EAN-13, GTIN-14): weights 3,1,3,1... from the right, sum must be a multiple of 10. */
export function gs1Valid(d: string): boolean {
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false;
  let sum = 0;
  for (let i = 0; i < d.length - 1; i++) sum += (d.charCodeAt(d.length - 2 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === d.charCodeAt(d.length - 1) - 48;
}

/** ISBN-10: weights 10..1, sum must be a multiple of 11. The last character may be X (ten). */
export function isbn10Valid(s: string): boolean {
  if (!/^\d{9}[\dXx]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    sum += (10 - i) * (ch === 'X' || ch === 'x' ? 10 : Number(ch));
  }
  return sum % 11 === 0;
}

export function luhnCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = body.charCodeAt(body.length - 1 - i) - 48;
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}
export function luhnValid(digits: string): boolean {
  return digits.length > 1 && /^\d+$/.test(digits) && luhnCheckDigit(digits.slice(0, -1)) === digits.charCodeAt(digits.length - 1) - 48;
}


/** Does this column's intact IDs obey the Luhn check? Only values that cannot be cut (last digit not zero) count. */
export function columnUsesLuhn(table: { rows: { t: string; text: string }[][] }, col: number, length: number): boolean {
  let seen = 0;
  let ok = 0;
  for (const r of table.rows) {
    const s = r[col].text.trim();
    if (s.length !== length || !/^\d+$/.test(s) || s.endsWith('0')) continue;
    // A number cell is a double: above 2^53 (9.007e15) even the last digits are unreliable, so they prove nothing.
    if (r[col].t === 'number' && Number(s) > Number.MAX_SAFE_INTEGER) continue;
    seen++;
    if (luhnValid(s)) ok++;
  }
  return seen >= 5 && ok / seen >= 0.95;
}

