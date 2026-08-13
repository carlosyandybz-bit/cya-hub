"use client";

import {
  downloadBundle as downloadBaseBundle,
  normalizeImportRows as normalizeBaseImportRows,
  parseTransferFile as parseBaseTransferFile,
  type CyaDataBundle,
  type ParsedTransferFile,
  type TransferFormat,
} from "./data-transfer-formats";

export type { CyaDataBundle, ParsedTransferFile, TransferFormat };

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function boolish(value: unknown): boolean | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const normalized = String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (["si", "true", "1", "yes"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
}

function withTeachingSpreadsheetSemantics(domain: string, mapped: Record<string, unknown>, raw: Record<string, unknown>) {
  const result = { ...mapped };
  const headers = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizedHeader(key), value]));
  const fixedType = domain === "correction" || domain === "explanation" || domain === "exercise" || domain === "sequence" ? domain : null;
  if (fixedType) result.content_type = fixedType;

  const shortDescription = headers["descripcion corta"] ?? headers["descripcion breve"];
  if (shortDescription !== undefined && (result.description === undefined || result.description === "")) result.description = shortDescription;

  const explanation = headers["explicacion"] ?? headers["explicacion completa"] ?? headers["como se explica"];
  if (explanation !== undefined && (result.correction_guidance === undefined || result.correction_guidance === "")) result.correction_guidance = explanation;

  const frequencyRaw = headers["frecuencia"] ?? headers["mide frecuencia"] ?? headers["medir frecuencia"];
  const importanceRaw = headers["importancia"] ?? headers["mide importancia"] ?? headers["medir importancia"];
  const frequency = boolish(frequencyRaw);
  const importance = boolish(importanceRaw);
  if (frequencyRaw !== undefined || importanceRaw !== undefined) {
    if (frequency === null || importance === null) result.measurement_mode = "__invalid__";
    else if (frequency === true && importance === true) result.measurement_mode = "both";
    else if (frequency === true) result.measurement_mode = "frequency";
    else if (importance === true) result.measurement_mode = "importance";
    else result.measurement_mode = "none";
  }

  const partnerRaw = headers["necesita pareja"] ?? headers["requiere pareja"] ?? headers["realizar en pareja"];
  if (partnerRaw !== undefined) {
    const partner = boolish(partnerRaw);
    result.requires_partner = partner === null ? String(partnerRaw) : partner;
  }

  return result;
}

export function normalizeImportRows(domain: string, rows: Array<Record<string, unknown>>) {
  const normalized = normalizeBaseImportRows(domain, rows);
  if (!["correction", "explanation", "exercise", "sequence", "teaching"].includes(domain)) return normalized;
  return normalized.map((mapped, index) => withTeachingSpreadsheetSemantics(domain, mapped, rows[index] ?? {}));
}

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
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
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
