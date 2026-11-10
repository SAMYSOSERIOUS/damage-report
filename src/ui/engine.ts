import {
  analyze,
  applyFixes,
  auditHtml,
  ENGINE_VERSION,
  exportCsv,
  exportXlsx,
  logToCsv,
  patchXlsx,
  planFixes,
  readTables,
  recoveryList,
  recoveryToCsv,
  type Decisions,
  type FixPlan,
  type Report,
  type Settings,
  type Table,
} from '../core';

export type ExportKind = 'patch' | 'xlsx' | 'csv' | 'log' | 'recovery' | 'audit';
export interface ExportOut {
  name: string;
  data: Uint8Array | string;
  type: string;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Everything that needs the whole file lives here, so it can run in a worker and keep the page responsive. */
export class Session {
  tables: Table[] = [];
  report!: Report;
  plans: FixPlan[] = [];

  constructor(
    readonly fileName: string,
    readonly bytes: Uint8Array,
  ) {}

  analyze(): Report {
    this.tables = readTables(this.fileName, this.bytes);
    this.report = analyze(this.fileName, this.tables);
    return this.report;
  }

  prepare(settings: Settings): { plans: FixPlan[]; formulaCells: number; isXlsx: boolean } {
    this.plans = this.tables.map((t, i) => planFixes(t, this.report.tables[i], settings));
    return { plans: this.plans, formulaCells: this.tables.reduce((n, t) => n + (t.formulaCells ?? 0), 0), isXlsx: /\.xls[xm]$/i.test(this.fileName) };
  }

  export(kind: ExportKind, decisions: Decisions): ExportOut {
    const base = this.fileName.replace(/\.[^.]+$/, '');
    const fixes = this.tables.map((t, i) => ({ table: t, plan: this.plans[i], fix: applyFixes(t, this.plans[i], decisions) }));
    const log = fixes.flatMap((f) => f.fix.log);
    const recovery = recoveryList(this.plans);
    switch (kind) {
      case 'patch':
        return { name: `${base}.fixed.xlsx`, data: patchXlsx(this.bytes, fixes), type: XLSX };
      case 'xlsx':
        return {
          name: `${base}.clean-copy.xlsx`,
          data: exportXlsx({ fixes: fixes.map((f) => ({ fix: f.fix, source: f.table.source, plan: f.plan, original: f.table })), log, recovery }),
          type: XLSX,
        };
      case 'csv':
        return { name: `${base}.fixed.csv`, data: exportCsv(fixes[0].fix), type: 'text/csv;charset=utf-8' };
      case 'log':
        return { name: `${base}.change-log.csv`, data: logToCsv(log), type: 'text/csv;charset=utf-8' };
      case 'recovery':
        return { name: `${base}.recovery-list.csv`, data: recoveryToCsv(recovery), type: 'text/csv;charset=utf-8' };
      case 'audit':
        return { name: `${base}.audit.html`, data: auditHtml(this.fileName, this.plans, log, recovery, ENGINE_VERSION), type: 'text/html;charset=utf-8' };
    }
  }
}
