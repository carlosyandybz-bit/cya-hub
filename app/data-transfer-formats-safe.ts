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

const decoder = new TextDecoder("utf-8");

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

function integerish(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function withPeopleSpreadsheetSemantics(mapped: Record<string, unknown>, raw: Record<string, unknown>) {
  const result = { ...mapped };
  const headers = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizedHeader(key), value]));
  const copy = (target: string, aliases: string[]) => {
    const value = aliases.map((alias) => headers[alias]).find((candidate) => candidate !== undefined && candidate !== "");
    if (value !== undefined && (result[target] === undefined || result[target] === "")) result[target] = value;
  };

  copy("city", ["ciudad", "localidad"]);
  copy("referred_by", ["referido por", "recomendada por", "recomendado por", "quien lo recomendo", "quien la recomendo"]);
  copy("dance_start_label", ["inicio", "inicio baile", "empezo a bailar", "ano inicio", "año inicio"]);
  copy("dance_end_label", ["fin", "fin baile", "dejo de bailar", "ano fin", "año fin"]);

  const booleans: Array<[string, string[]]> = [
    ["has_partner", ["pareja", "tiene pareja", "con pareja"]],
    ["continues_dancing", ["sigue bailando", "continua bailando", "continúa bailando"]],
    ["bought_bonus", ["compro bono", "compró bono", "ha comprado bono", "bono comprado"]],
    ["wedding", ["boda", "es boda"]],
    ["tourist", ["turista", "es turista"]],
  ];
  for (const [target, aliases] of booleans) {
    const rawValue = aliases.map((alias) => headers[alias]).find((candidate) => candidate !== undefined && candidate !== "");
    if (rawValue !== undefined) {
      const parsed = boolish(rawValue);
      result[target] = parsed === null ? String(rawValue) : parsed;
    }
  }

  const numericFields: Array<[string, string[]]> = [
    ["historical_classes", ["clases", "clases historicas", "clases históricas", "numero clases", "n clases"]],
    ["historical_consumed_classes", ["clases consumidas", "consumidas", "clases gastadas"]],
  ];
  for (const [target, aliases] of numericFields) {
    const rawValue = aliases.map((alias) => headers[alias]).find((candidate) => candidate !== undefined && candidate !== "");
    if (rawValue !== undefined) {
      const parsed = integerish(rawValue);
      result[target] = parsed === null ? String(rawValue) : parsed;
    }
  }

  const paidRaw = ["total pagado", "importe total", "pagado", "total abonado"].map((alias) => headers[alias]).find((candidate) => candidate !== undefined && candidate !== "");
  if (paidRaw !== undefined) {
    const amount = Number(String(paidRaw).replace(/[^0-9,.-]/g, "").replace(",", "."));
    result.historical_total_paid_cents = Number.isFinite(amount) ? Math.round(amount * 100) : String(paidRaw);
  }

  return result;
}

export function normalizeImportRows(domain: string, rows: Array<Record<string, unknown>>) {
  const normalized = normalizeBaseImportRows(domain, rows);
  if (["people", "person", "student", "students"].includes(domain)) {
    return normalized.map((mapped, index) => withPeopleSpreadsheetSemantics(mapped, rows[index] ?? {}));
  }
  if (["correction", "explanation", "exercise", "sequence", "teaching"].includes(domain)) {
    return normalized.map((mapped, index) => withTeachingSpreadsheetSemantics(domain, mapped, rows[index] ?? {}));
  }
  return normalized;
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

function xmlDocument(bytes: Uint8Array) {
  const document = new DOMParser().parseFromString(decoder.decode(bytes), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("El archivo Excel contiene XML inválido.");
  return document;
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no puede abrir archivos Excel comprimidos.");
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipExcel(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset += 1) {
    if (view.getUint32(offset, true) === 0x06054b50) endOffset = offset;
  }
  if (endOffset < 0) throw new Error("El archivo Excel no contiene una estructura ZIP válida.");

  const count = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const files = new Map<string, Uint8Array>();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("El archivo Excel está dañado.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const rawName = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const name = rawName.replaceAll("\\", "/").replace(/^\/+/, "");
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("El archivo Excel contiene una entrada inválida.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
    if (!data) throw new Error("El archivo Excel usa una compresión no compatible.");
    files.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function normalizeWorkbookTarget(target: string) {
  const cleaned = decodeURIComponent(target).replaceAll("\\", "/").replace(/^\/+/, "");
  const pieces = (cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned}`).split("/");
  const normalized: string[] = [];
  for (const piece of pieces) {
    if (!piece || piece === ".") continue;
    if (piece === "..") normalized.pop();
    else normalized.push(piece);
  }
  return normalized.join("/");
}

function sharedStrings(files: Map<string, Uint8Array>) {
  const bytes = files.get("xl/sharedStrings.xml");
  if (!bytes) return [] as string[];
  const document = xmlDocument(bytes);
  return Array.from(document.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("")
  );
}

function excelColumn(reference: string) {
  const letters = reference.replace(/\d+/g, "").toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function worksheetRows(bytes: Uint8Array, shared: string[]) {
  const document = xmlDocument(bytes);
  const matrix: unknown[][] = [];
  Array.from(document.getElementsByTagName("row")).forEach((rowNode) => {
    const values: unknown[] = [];
    Array.from(rowNode.getElementsByTagName("c")).forEach((cell) => {
      const column = excelColumn(cell.getAttribute("r") ?? "");
      const type = cell.getAttribute("t") ?? "";
      const valueNode = cell.getElementsByTagName("v")[0];
      let value: unknown = "";
      if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("");
      else if (type === "s") value = shared[Number(valueNode?.textContent ?? 0)] ?? "";
      else if (type === "b") value = valueNode?.textContent === "1";
      else if (type === "str") value = valueNode?.textContent ?? "";
      else if (valueNode?.textContent !== null && valueNode?.textContent !== undefined) {
        const number = Number(valueNode.textContent);
        value = Number.isFinite(number) ? number : valueNode.textContent;
      }
      values[column] = value;
    });
    matrix.push(values);
  });

  if (!matrix.length) return [] as Array<Record<string, unknown>>;
  const headers = matrix[0].map((value, index) => String(value ?? "").trim() || `column_${index + 1}`);
  return matrix.slice(1)
    .filter((row) => row.some((value) => value !== "" && value !== null && value !== undefined))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

async function parseStandardExcelFallback(file: File): Promise<ParsedTransferFile> {
  const files = await unzipExcel(await file.arrayBuffer());
  const workbookBytes = files.get("xl/workbook.xml");
  if (!workbookBytes) throw new Error("El archivo Excel no contiene un libro válido.");

  const workbook = xmlDocument(workbookBytes);
  const relationshipBytes = files.get("xl/_rels/workbook.xml.rels");
  const relationshipMap = new Map<string, string>();
  if (relationshipBytes) {
    const relationships = xmlDocument(relationshipBytes);
    Array.from(relationships.getElementsByTagName("Relationship")).forEach((node) => {
      const id = node.getAttribute("Id") ?? "";
      const target = node.getAttribute("Target") ?? "";
      if (id && target) relationshipMap.set(id, normalizeWorkbookTarget(target));
    });
  }

  const shared = sharedStrings(files);
  const sheets = Array.from(workbook.getElementsByTagName("sheet"));
  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index];
    if ((sheet.getAttribute("name") ?? "") === "__CYA_MANIFEST") continue;
    const relationId = sheet.getAttribute("r:id")
      ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
      ?? "";
    const candidates = [
      relationshipMap.get(relationId),
      `xl/worksheets/sheet${index + 1}.xml`,
    ].filter((value): value is string => Boolean(value));
    const worksheet = candidates.map((path) => files.get(path)).find(Boolean);
    if (!worksheet) continue;
    const rows = worksheetRows(worksheet, shared);
    if (rows.length) return { kind: "rows", format: "xlsx", rows };
  }

  // Last-resort discovery for workbooks whose relationship metadata is unusual.
  const worksheetNames = Array.from(files.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort();
  for (const name of worksheetNames) {
    const bytes = files.get(name);
    if (!bytes) continue;
    const rows = worksheetRows(bytes, shared);
    if (rows.length) return { kind: "rows", format: "xlsx", rows };
  }

  throw new Error("El archivo Excel contiene hojas, pero no se han encontrado filas de datos utilizables.");
}

export function downloadBundle(bundle: CyaDataBundle, format: TransferFormat) {
  downloadBaseBundle(format === "xlsx" ? withExactExcelRows(bundle) : bundle, format);
}

export async function parseTransferFile(file: File): Promise<ParsedTransferFile> {
  const parsed = await parseBaseTransferFile(file);
  if (parsed.kind === "bundle" && parsed.format === "xlsx") {
    return { ...parsed, bundle: recoverExactExcelRows(parsed.bundle) };
  }
  if (parsed.kind === "rows" && parsed.format === "xlsx" && parsed.rows.length === 0) {
    return parseStandardExcelFallback(file);
  }
  return parsed;
}
