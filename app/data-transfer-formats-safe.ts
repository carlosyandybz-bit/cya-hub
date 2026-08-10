"use client";

import {
  downloadBundle as downloadBaseBundle,
  normalizeImportRows,
  parseTransferFile as parseBaseTransferFile,
  type CyaDataBundle,
  type ParsedTransferFile,
  type TransferFormat,
} from "./data-transfer-formats";

export { normalizeImportRows };
export type { CyaDataBundle, ParsedTransferFile, TransferFormat };

function withExactExcelRows(bundle: CyaDataBundle): CyaDataBundle {
  const tables = Object.fromEntries(Object.entries(bundle.tables).map(([table, rows]) => [
    table,
    rows.map((row) => ({ ...row, __record_json: JSON.stringify(row) })),
  ]));
  const columns = Object.fromEntries(Object.entries(bundle.tables).map(([table, rows]) => [
    table,
    [...(bundle.columns[table] ?? (rows[0] ? Object.keys(rows[0]) : [])), "__record_json"],
  ]));
  return { ...bundle, tables, columns };
}

function recoverExactExcelRows(bundle: CyaDataBundle): CyaDataBundle {
  const tables = Object.fromEntries(Object.entries(bundle.tables).map(([table, rows]) => {
    const exact = rows.map((row) => {
      const raw = row.__record_json;
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        try { return JSON.parse(raw) as Record<string, unknown>; } catch { /* use visible values below */ }
      }
      return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "__record_json"));
    });
    return [table, exact];
  }));
  const columns = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [
    table,
    (rows as Array<Record<string, unknown>>)[0] ? Object.keys((rows as Array<Record<string, unknown>>)[0]) : [],
  ]));
  const row_counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, (rows as Array<Record<string, unknown>>).length]));
  return { ...bundle, tables, columns, row_counts };
}

export function downloadBundle(bundle: CyaDataBundle, format: TransferFormat) {
  downloadBaseBundle(format === "xlsx" ? withExactExcelRows(bundle) : bundle, format);
}

export async function parseTransferFile(file: File): Promise<ParsedTransferFile> {
  const parsed = await parseBaseTransferFile(file);
  if (parsed.kind === "bundle" && parsed.format === "xlsx") {
    return { ...parsed, bundle: recoverExactExcelRows(parsed.bundle) };
  }
  return parsed;
}
