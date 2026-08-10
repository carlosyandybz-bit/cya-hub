"use client";

export type TransferFormat = "json" | "csv" | "xlsx";

export type CyaDataBundle = {
  format: "cya-hub-backup";
  version: number;
  exported_at: string;
  schema_version: string | null;
  domain: string;
  restore_mode: "merge";
  requires_existing_auth_users: boolean;
  excluded_sensitive_fields: string[];
  columns: Record<string, string[]>;
  row_counts: Record<string, number>;
  tables: Record<string, Array<Record<string, unknown>>>;
  checksum: string;
};

export type ParsedTransferFile =
  | { kind: "bundle"; format: TransferFormat; bundle: CyaDataBundle }
  | { kind: "rows"; format: TransferFormat; rows: Array<Record<string, unknown>> };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed) && trimmed.length < 16) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed) as unknown; } catch { return value; }
  }
  return value;
}

function parseCsvMatrix(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

function matrixToRecords(matrix: string[][]) {
  if (!matrix.length) return [] as Array<Record<string, unknown>>;
  const headers = matrix[0].map((header, index) => header.trim() || `column_${index + 1}`);
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, parseScalar(row[index] ?? "")])));
}

function portableCsv(bundle: CyaDataBundle) {
  const lines = ["__table,__record_json"];
  const manifest = { ...bundle, tables: undefined, columns: undefined, row_counts: undefined };
  lines.push(`${csvEscape("__CYA_MANIFEST")},${csvEscape(manifest)}`);
  Object.entries(bundle.tables).forEach(([table, rows]) => rows.forEach((row) => {
    lines.push(`${csvEscape(table)},${csvEscape(row)}`);
  }));
  return `\uFEFF${lines.join("\r\n")}`;
}

function bundleFromPortableCsv(records: Array<Record<string, unknown>>): CyaDataBundle | null {
  if (!records.length || !("__table" in records[0]) || !("__record_json" in records[0])) return null;
  const manifestRow = records.find((row) => String(row.__table ?? "") === "__CYA_MANIFEST");
  if (!manifestRow) return null;
  const rawManifest = manifestRow.__record_json;
  const manifest = typeof rawManifest === "string" ? JSON.parse(rawManifest) as Record<string, unknown> : asRecord(rawManifest);
  if (manifest.format !== "cya-hub-backup") return null;
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  records.forEach((row) => {
    const table = String(row.__table ?? "");
    if (!table || table === "__CYA_MANIFEST") return;
    const raw = row.__record_json;
    const record = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : asRecord(raw);
    (tables[table] ??= []).push(record);
  });
  const columns = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length ? Object.keys(rows[0]) : []]));
  const row_counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
  return { ...manifest, tables, columns, row_counts } as unknown as CyaDataBundle;
}

function xmlEscape(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function excelColumn(index: number) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function xlsxCell(value: unknown, row: number, column: number) {
  const ref = `${excelColumn(column)}${row}`;
  if (value === null || value === undefined || value === "") return `<c r="${ref}" t="inlineStr"><is><t></t></is></c>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function worksheetXml(columns: string[], rows: Array<Record<string, unknown>>) {
  const allRows = [columns, ...rows.map((record) => columns.map((column) => record[column]))];
  const rowXml = allRows.map((values, rowIndex) =>
    `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => xlsxCell(value, rowIndex + 1, columnIndex)).join("")}</row>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let crc = index;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      crcTable[index] = crc >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

function zipStored(entries: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0);
    write32(localView, 14, checksum);
    write32(localView, 18, entry.data.length);
    write32(localView, 22, entry.data.length);
    write16(localView, 26, nameBytes.length);
    write16(localView, 28, 0);
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0);
    write32(centralView, 16, checksum);
    write32(centralView, 20, entry.data.length);
    write32(centralView, 24, entry.data.length);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function buildXlsx(bundle: CyaDataBundle) {
  const manifestRows = Object.entries({
    format: bundle.format,
    version: bundle.version,
    exported_at: bundle.exported_at,
    schema_version: bundle.schema_version,
    domain: bundle.domain,
    restore_mode: bundle.restore_mode,
    requires_existing_auth_users: bundle.requires_existing_auth_users,
    excluded_sensitive_fields: bundle.excluded_sensitive_fields,
    checksum: bundle.checksum,
  }).map(([key, value]) => ({ key, value }));
  const sheets = [
    { name: "__CYA_MANIFEST", columns: ["key", "value"], rows: manifestRows },
    ...Object.entries(bundle.tables).map(([name, rows]) => ({
      name,
      columns: bundle.columns[name] ?? (rows[0] ? Object.keys(rows[0]) : []),
      rows,
    })),
  ];
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const rels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const entries = [
    { name: "[Content_Types].xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`) },
    { name: "_rels/.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: encoder.encode(worksheetXml(sheet.columns, sheet.rows)) })),
  ];
  return zipStored(entries);
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no puede abrir archivos Excel comprimidos.");
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer) {
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
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("El archivo Excel contiene una entrada inválida.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
    if (!data) throw new Error("El archivo Excel usa una compresión no compatible.");
    files.set(name.replace(/^\/+/, ""), data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function xmlDocument(bytes: Uint8Array) {
  const document = new DOMParser().parseFromString(decoder.decode(bytes), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("El archivo Excel contiene XML inválido.");
  return document;
}

function cellColumn(reference: string) {
  const letters = reference.replace(/\d+/g, "").toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function isExcelDateFormat(numFmtId: number, custom: string | undefined) {
  if ([14,15,16,17,18,19,20,21,22,45,46,47].includes(numFmtId)) return true;
  return Boolean(custom && /[ymdhis]/i.test(custom.replace(/"[^"]*"/g, "")));
}

function excelSerialDate(value: number) {
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  return value % 1 === 0 ? date.toISOString().slice(0, 10) : date.toISOString();
}

function parseStyles(files: Map<string, Uint8Array>) {
  const bytes = files.get("xl/styles.xml");
  if (!bytes) return [] as boolean[];
  const doc = xmlDocument(bytes);
  const custom = new Map<number, string>();
  Array.from(doc.getElementsByTagName("numFmt")).forEach((node) => custom.set(Number(node.getAttribute("numFmtId")), node.getAttribute("formatCode") ?? ""));
  const cellXfs = doc.getElementsByTagName("cellXfs")[0];
  if (!cellXfs) return [];
  return Array.from(cellXfs.getElementsByTagName("xf")).map((node) => {
    const id = Number(node.getAttribute("numFmtId") ?? 0);
    return isExcelDateFormat(id, custom.get(id));
  });
}

function parseSharedStrings(files: Map<string, Uint8Array>) {
  const bytes = files.get("xl/sharedStrings.xml");
  if (!bytes) return [] as string[];
  const doc = xmlDocument(bytes);
  return Array.from(doc.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("")
  );
}

function worksheetRecords(bytes: Uint8Array, shared: string[], dateStyles: boolean[]) {
  const doc = xmlDocument(bytes);
  const matrix: unknown[][] = [];
  Array.from(doc.getElementsByTagName("row")).forEach((rowNode) => {
    const values: unknown[] = [];
    Array.from(rowNode.getElementsByTagName("c")).forEach((cell) => {
      const column = cellColumn(cell.getAttribute("r") ?? "");
      const type = cell.getAttribute("t") ?? "";
      const style = Number(cell.getAttribute("s") ?? 0);
      const valueNode = cell.getElementsByTagName("v")[0];
      let value: unknown = "";
      if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("");
      else if (type === "s") value = shared[Number(valueNode?.textContent ?? 0)] ?? "";
      else if (type === "b") value = valueNode?.textContent === "1";
      else if (type === "str") value = valueNode?.textContent ?? "";
      else if (valueNode?.textContent !== null && valueNode?.textContent !== undefined) {
        const numeric = Number(valueNode.textContent);
        value = Number.isFinite(numeric) ? (dateStyles[style] ? excelSerialDate(numeric) : numeric) : valueNode.textContent;
      }
      values[column] = typeof value === "string" ? parseScalar(value) : value;
    });
    matrix.push(values);
  });
  if (!matrix.length) return [] as Array<Record<string, unknown>>;
  const headers = matrix[0].map((value, index) => String(value ?? "").trim() || `column_${index + 1}`);
  return matrix.slice(1).filter((row) => row.some((value) => value !== "" && value !== null && value !== undefined))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedTransferFile> {
  const files = await unzip(buffer);
  const workbookBytes = files.get("xl/workbook.xml");
  const relBytes = files.get("xl/_rels/workbook.xml.rels");
  if (!workbookBytes || !relBytes) throw new Error("El archivo Excel no contiene un libro válido.");
  const workbook = xmlDocument(workbookBytes);
  const relationships = xmlDocument(relBytes);
  const relMap = new Map<string, string>();
  Array.from(relationships.getElementsByTagName("Relationship")).forEach((node) => relMap.set(node.getAttribute("Id") ?? "", node.getAttribute("Target") ?? ""));
  const shared = parseSharedStrings(files);
  const dateStyles = parseStyles(files);
  const sheets = Array.from(workbook.getElementsByTagName("sheet")).map((node) => {
    const name = node.getAttribute("name") ?? "Hoja";
    const relationId = node.getAttribute("r:id") ?? node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const target = relMap.get(relationId) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const bytes = files.get(path);
    return { name, rows: bytes ? worksheetRecords(bytes, shared, dateStyles) : [] };
  });
  const manifestSheet = sheets.find((sheet) => sheet.name === "__CYA_MANIFEST");
  if (manifestSheet) {
    const manifest = Object.fromEntries(manifestSheet.rows.map((row) => [String(row.key ?? ""), row.value]));
    if (manifest.format === "cya-hub-backup") {
      const tables = Object.fromEntries(sheets.filter((sheet) => sheet.name !== "__CYA_MANIFEST").map((sheet) => [sheet.name, sheet.rows]));
      const columns = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, (rows as Array<Record<string, unknown>>)[0] ? Object.keys((rows as Array<Record<string, unknown>>)[0]) : []]));
      const row_counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, (rows as Array<Record<string, unknown>>).length]));
      const excluded = Array.isArray(manifest.excluded_sensitive_fields) ? manifest.excluded_sensitive_fields : [];
      return {
        kind: "bundle",
        format: "xlsx",
        bundle: { ...manifest, excluded_sensitive_fields: excluded, tables, columns, row_counts } as unknown as CyaDataBundle,
      };
    }
  }
  const first = sheets.find((sheet) => sheet.name !== "__CYA_MANIFEST");
  return { kind: "rows", format: "xlsx", rows: first?.rows ?? [] };
}

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const commonAliases: Record<string, string> = {
  "nombre": "display_name",
  "nombre completo": "display_name",
  "telefono": "phone",
  "email": "email",
  "correo": "email",
  "pais": "country_code",
  "observaciones": "notes",
  "notas": "notes",
  "titulo": "title",
  "descripcion": "description",
  "explicacion": "description",
  "tipo": "content_type",
  "estado": "status",
};

const peopleAliases: Record<string, string> = {
  "fecha": "contact_date",
  "como nos conocio": "source",
  "que queria": "inquiry",
  "reservo": "reserved",
  "importe": "quoted_amount_eur",
  "es alumno": "is_student",
};

const teachingAliases: Record<string, string> = {
  "como se corrige": "correction_guidance",
  "medicion": "measurement_mode",
  "visibilidad": "visibility",
  "publicacion": "publication_status",
};

const rateAliases: Record<string, string> = {
  "nombre tarifa": "name",
  "tipo tarifa": "rate_type",
  "duracion minutos": "duration_minutes",
  "precio": "price_eur",
  "precio euros": "price_eur",
  "moneda": "currency",
};

function boolValue(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["si","sí","true","1","yes"].includes(normalized)) return true;
  if (["no","false","0"].includes(normalized)) return false;
  return value;
}

export function normalizeImportRows(domain: string, rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      const normalized = normalizedHeader(key);
      const alias = peopleAliases[normalized] ?? teachingAliases[normalized] ?? rateAliases[normalized] ?? commonAliases[normalized] ?? key.trim();
      mapped[alias] = value;
    });
    if ("reserved" in mapped) mapped.reserved = boolValue(mapped.reserved);
    if ("is_student" in mapped) mapped.is_student = boolValue(mapped.is_student);
    if ("quoted_amount_eur" in mapped && mapped.quoted_amount_eur !== "") {
      const amount = Number(String(mapped.quoted_amount_eur).replace(",", "."));
      if (Number.isFinite(amount)) mapped.quoted_amount_cents = Math.round(amount * 100);
      delete mapped.quoted_amount_eur;
    }
    if ("price_eur" in mapped && mapped.price_eur !== "") {
      const amount = Number(String(mapped.price_eur).replace(",", "."));
      if (Number.isFinite(amount)) mapped.price_cents = Math.round(amount * 100);
      delete mapped.price_eur;
    }
    if (domain === "correction" || domain === "explanation" || domain === "exercise" || domain === "sequence") mapped.content_type = domain;
    return mapped;
  });
}

export async function parseTransferFile(file: File): Promise<ParsedTransferFile> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return parseXlsx(await file.arrayBuffer());
  if (extension === "csv") {
    const records = matrixToRecords(parseCsvMatrix(await file.text()));
    const bundle = bundleFromPortableCsv(records);
    return bundle ? { kind: "bundle", format: "csv", bundle } : { kind: "rows", format: "csv", rows: records };
  }
  if (extension === "json") {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && asRecord(parsed).format === "cya-hub-backup") {
      return { kind: "bundle", format: "json", bundle: parsed as CyaDataBundle };
    }
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(asRecord(parsed).items) ? asRecord(parsed).items as unknown[] : null;
    if (!rows) throw new Error("El JSON debe ser una copia CYA Hub o contener una lista de registros.");
    return { kind: "rows", format: "json", rows: rows.map(asRecord) };
  }
  throw new Error("Usa un archivo JSON, CSV o Excel .xlsx.");
}

export function downloadBundle(bundle: CyaDataBundle, format: TransferFormat) {
  const date = new Date().toISOString().slice(0, 10);
  const base = `cya-hub-${bundle.domain}-${date}`;
  if (format === "json") {
    downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" }), `${base}.json`);
    return;
  }
  if (format === "csv") {
    downloadBlob(new Blob([portableCsv(bundle)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
    return;
  }
  downloadBlob(buildXlsx(bundle), `${base}.xlsx`);
}
