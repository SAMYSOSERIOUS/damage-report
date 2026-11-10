import { MONTH_ABBR_EN } from './months';

export function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

/** Convert an Excel serial number to a calendar date. Handles the 1900 leap-year bug and the 1904 system. */
export function serialToYMD(serial: number, date1904 = false): YMD {
  let days = Math.floor(serial);
  let base: number;
  if (date1904) {
    base = Date.UTC(1904, 0, 1);
  } else {
    if (days >= 60) days -= 1; // Excel treats 1900 as a leap year; serial 60 is the fake 29 Feb 1900
    base = Date.UTC(1899, 11, 31);
  }
  const dt = new Date(base + days * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export interface FmtInfo {
  isDate: boolean;
  hasDay: boolean;
  hasMonthText: boolean;
  hasYear: boolean;
}

const BUILTIN_DATE: Record<number, string> = {
  14: 'm/d/yyyy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  22: 'm/d/yy h:mm',
  27: 'yyyy"年"m"月"',
  28: 'm"月"d"日"',
  29: 'm"月"d"日"',
  30: 'm/d/yy',
  31: 'yyyy"年"m"月"d"日"',
  32: 'h"時"mm"分"',
  33: 'h"時"mm"分"ss"秒"',
  34: 'yyyy"年"m"月"',
  35: 'm"月"d"日"',
  36: 'yyyy"年"m"月"d"日"',
  50: 'yyyy"年"m"月"',
  51: 'm"月"d"日"',
  52: 'yyyy"年"m"月"',
  53: 'm"月"d"日"',
  54: 'm"月"d"日"',
  55: 'yyyy"年"m"月"',
  56: 'yyyy"年"m"月"d"日"',
  57: 'yyyy"年"m"月"',
  58: 'm"月"d"日"',
};

/** Built-in Excel number-format ids that are dates. Time-only ids (18-21, 45-47) are not. */
export function builtinDateFormat(id: number): string | undefined {
  if (id === 14 || id === 15 || id === 16 || id === 17 || id === 22) return BUILTIN_DATE[id];
  if (id >= 27 && id <= 31) return BUILTIN_DATE[id];
  if (id >= 34 && id <= 36) return BUILTIN_DATE[id];
  if (id >= 50 && id <= 58) return BUILTIN_DATE[id];
  return undefined;
}

export function fmtInfo(code: string): FmtInfo {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .toLowerCase();
  const hasDay = /d/.test(stripped);
  const hasYear = /y/.test(stripped);
  const hasMonthText = /mmm/.test(stripped);
  const hasMonthNum = /m/.test(stripped) && (hasDay || hasYear);
  const isDate = hasDay || hasYear || hasMonthText || hasMonthNum;
  return { isDate, hasDay, hasYear, hasMonthText };
}

/** Plain English-style display of a date cell, close to what Excel shows for the common formats. */
export function formatDate(serial: number, code: string, date1904 = false): string {
  const { y, m, d } = serialToYMD(serial, date1904);
  const info = fmtInfo(code);
  const mon = MONTH_ABBR_EN[m - 1];
  const yy = String(y % 100).padStart(2, '0');
  if (info.hasMonthText && info.hasDay && !info.hasYear) return `${d}-${mon}`;
  if (info.hasMonthText && info.hasYear && !info.hasDay) return `${mon}-${yy}`;
  if (info.hasMonthText && info.hasDay && info.hasYear) return `${d}-${mon}-${yy}`;
  if (info.hasDay && !info.hasYear) return `${m}/${d}`;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
