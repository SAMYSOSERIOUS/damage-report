import type { Detector } from './common';
import { finding } from './common';

const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const SPECIALS = Object.keys(CP1252)
  .map((k) => String.fromCharCode(Number(k)))
  .join('');
// A UTF-8 lead byte read as Latin-1/Windows-1252 followed by one or more continuation bytes read the same way.
const CHUNK = new RegExp(`[\\u00C2-\\u00F4](?:[\\u0080-\\u00BF${SPECIALS}])+`, 'g');
const SUSPECT = new RegExp(`[\\u00C2-\\u00F4][\\u0080-\\u00BF${SPECIALS}]|\\uFFFD`);

function decodeChunk(chunk: string): string | null {
  const bytes: number[] = [];
  for (const ch of chunk) {
    const cp = ch.codePointAt(0)!;
    if (cp < 256) bytes.push(cp);
    else if (CP1252[cp] !== undefined) bytes.push(CP1252[cp]);
    else return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/** Undo "UTF-8 text read as Latin-1". Returns the input unchanged if nothing looks garbled. */
export function fixMojibake(s: string): string {
  return s.replace(CHUNK, (chunk) => decodeChunk(chunk) ?? chunk);
}

/** Text such as "JosÃ©" instead of "José". Text bytes read with the wrong character set. */
export const mojibake: Detector = {
  id: 'mojibake',
  run(ctx) {
    const out = [];
    const { table, col } = ctx;
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      if (c.t !== 'text' || !SUSPECT.test(c.text)) continue;
      const fixed = fixMojibake(c.text);
      if (fixed !== c.text) {
        out.push(
          finding(
            ctx,
            i,
            'mojibake',
            'high',
            'The characters in this cell look like text that was saved in one character set and read in another, a common result of opening UTF-8 files in Excel.',
            fixed,
          ),
        );
      } else if (c.text.includes('\uFFFD')) {
        out.push(
          finding(
            ctx,
            i,
            'mojibake',
            'medium',
            'This cell contains the replacement character. The original letter was lost when the file was read in the wrong character set, so it cannot be repaired from this file.',
          ),
        );
      }
    }
    return out;
  },
};
