import { readCsvBytes } from './csv';
import { readXlsxBytes } from './xlsx';
import type { Table } from '../types';

export { readCsvText, readCsvBytes } from './csv';
export { readXlsxBytes } from './xlsx';

/** Read a spreadsheet file from its bytes. The file type comes from the name. */
export function readTables(fileName: string, bytes: Uint8Array): Table[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return readXlsxBytes(bytes, fileName);
  if (lower.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. In Excel, use Save As and choose .xlsx or CSV, then try again.');
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    return [readCsvBytes(bytes, fileName)];
  }
  throw new Error('Unsupported file type. Use .csv, .tsv, or .xlsx.');
}
