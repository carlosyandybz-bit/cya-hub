"use client";

import { CheckCircle2, ClipboardList, DatabaseBackup, Download, FileInput, ShieldCheck, Upload } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangeEvent, useEffect, useState } from "react";
import { AdminDataReset } from "./admin-data-reset";
import { downloadBundle, normalizeImportRows, parseTransferFile, type CyaDataBundle, type TransferFormat } from "./data-transfer-formats-safe";

type TransferJob = {
  id: number;
  direction: string;
  domain: string;
  file_name: string | null;
  format: string;
  status: string;
  preview: Record<string, unknown>;
  result: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};

const exportDomains = [
  ["people", "Personas"],
  ["classes", "Clases"],
  ["credits", "Bonos"],
  ["teaching", "Enseñanza"],
  ["missions", "Misiones"],
  ["marketing", "Marketing"],
  ["forms", "Formularios"],
  ["calendar", "Agenda y calendario"],
  ["bz", "BZ Points y recompensas"],
  ["feedback", "Feedback Online"],
  ["academy", "Academia Online"],
  ["settings", "Configuración"],
  ["complete", "Copia completa"],
] as const;

const importDomains = [
  ["people", "Personas / CRM"],
  ["correction", "Correcciones"],
  ["explanation", "Explicaciones"],
  ["exercise", "Ejercicios"],
  ["sequence", "Secuencias"],
  ["teaching", "Enseñanza genérica"],
  ["daily_quotes", "Frases diarias"],
  ["mission_rules", "Reglas de misión"],
  ["marketing_rates", "Tarifas"],
  ["bz", "BZ Points y recompensas"],
  ["feedback", "Feedback Online"],
  ["academy", "Academia Online"],
  ["complete", "Copia CYA completa"],
] as const;

function readableError(message: string) {
  if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("permiso")) return "Tu cuenta no tiene permiso real para realizar ese cambio.";
  return message;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function AdminDataTransfer({
  client,
  transfers,
  refresh,
  notify,
}: {
  client: SupabaseClient;
  transfers: TransferJob[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [exportFormat, setExportFormat] = useState<TransferFormat>("xlsx");
  const [importDomain, setImportDomain] = useState("people");
  const [importStrategy, setImportStrategy] = useState("fill_empty");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<TransferJob | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (importPreview) return;
    const pending = transfers.find((job) => job.direction === "import" && job.status === "validated");
    if (pending) setImportPreview(pending);
  }, [transfers, importPreview]);

  async function exportDomain(domain: string) {
    setBusy(`export-${domain}`);
    try {
      const result = await client.rpc("export_data_bundle", { p_domain: domain });
      if (result.error) throw result.error;
      downloadBundle(result.data as CyaDataBundle, exportFormat);
      await refresh();
      notify(`Exportación ${exportFormat === "xlsx" ? "Excel" : exportFormat.toUpperCase()} preparada.`);
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo exportar."));
    }
    setBusy("");
  }

  async function previewImport() {
    if (!importFile) return;
    setBusy("preview");
    setImportPreview(null);
    setRestoreConfirmation("");
    try {
      const parsed = await parseTransferFile(importFile);
      if (parsed.kind === "rows" && importDomain === "feedback") throw new Error("Feedback Online se importa desde una copia JSON exportada por CYA Hub, no desde CSV/Excel plano.");
      if (parsed.kind === "rows" && importDomain === "academy") throw new Error("Academia Online se importa desde una copia JSON exportada por CYA Hub, no desde CSV/Excel plano.");
      if (parsed.kind === "bundle") {
        if (importDomain !== "complete" && parsed.bundle.domain !== importDomain && !(importDomain === "teaching" && parsed.bundle.domain === "teaching")) {
          throw new Error(`El archivo es una copia de «${parsed.bundle.domain}». Selecciona ese tipo o «Copia CYA completa».`);
        }
        const result = await client.rpc("preview_backup_restore", {
          p_bundle: parsed.bundle,
          p_file_name: importFile.name,
          p_format: parsed.format,
        });
        if (result.error) throw result.error;
        setImportPreview(result.data as TransferJob);
      } else {
        if (importDomain === "complete") throw new Error("Para restaurar una copia completa selecciona un archivo CYA exportado desde esta pantalla.");
        const rows = normalizeImportRows(importDomain, parsed.rows);
        if (!rows.length) throw new Error("El archivo no contiene registros utilizables.");
        const backendDomain = ["correction", "explanation", "exercise", "sequence"].includes(importDomain) ? "teaching" : importDomain;
        const result = await client.rpc("preview_data_import_v2", {
          p_domain: backendDomain,
          p_payload: rows,
          p_strategy: importStrategy,
          p_file_name: importFile.name,
          p_format: parsed.format,
        });
        if (result.error) throw result.error;
        setImportPreview(result.data as TransferJob);
      }
      await refresh();
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo analizar el archivo."));
    }
    setBusy("");
  }

  async function applyImport() {
    if (!importPreview) return;
    const isBackup = Boolean(importPreview.preview.backup);
    if (isBackup && restoreConfirmation !== "RESTAURAR") {
      notify("Escribe RESTAURAR para confirmar la restauración de la copia.");
      return;
    }
    if (!isBackup && !window.confirm("¿Aplicar los cambios de esta importación? La operación se ejecutará de forma atómica.")) return;
    setBusy("apply");
    try {
      const result = isBackup
        ? await client.rpc("apply_backup_restore", { p_job_id: importPreview.id })
        : await client.rpc("apply_data_import_v2", { p_job_id: importPreview.id });
      if (result.error) throw result.error;
      const job = result.data as TransferJob;
      setImportPreview(job);
      await refresh();
      if (job.status === "failed") throw new Error(job.error_message || "La operación se revirtió porque encontró un error.");
      notify(isBackup ? "Copia restaurada correctamente." : "Importación aplicada correctamente.");
      if (job.status === "completed") {
        setImportFile(null);
        setRestoreConfirmation("");
      }
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo aplicar la importación."));
    }
    setBusy("");
  }

  const previewData = importPreview?.preview ?? {};
  const isBackup = Boolean(previewData.backup);
  const restorable = !isBackup || Boolean(previewData.restorable);
  const missingAuth = Array.isArray(previewData.missing_auth_users) ? previewData.missing_auth_users : [];
  const tableCounts = objectValue(previewData.tables);

  return <section className="admin-stack">
    <div className="admin-content-grid">
      <article className="card pad">
        <div className="card-head"><div><p className="eyebrow">Exportar</p><h2>Descargar datos</h2></div><Download /></div>
        <label className="field"><span>Formato</span><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as TransferFormat)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
        <div className="export-grid">{exportDomains.map(([value, label]) => <button key={value} className="btn ghost" disabled={Boolean(busy)} onClick={() => exportDomain(value)}><Download /> {busy === `export-${value}` ? "Preparando…" : label}</button>)}</div>
        <p className="admin-note">Excel crea una hoja por tabla. CSV conserva una estructura portable de varias tablas. JSON es el formato más directo para una copia integral. Ninguno incluye contraseñas, tokens ni referencias de credenciales.</p>
      </article>

      <article className="card pad">
        <div className="card-head"><div><p className="eyebrow">Importar</p><h2>Analizar antes de cambiar</h2></div><Upload /></div>
        <div className="fields-2">
          <label className="field"><span>Tipo de información</span><select value={importDomain} onChange={(event) => { setImportDomain(event.target.value); setImportPreview(null); }}>{importDomains.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Duplicados</span><select value={importStrategy} disabled={importDomain === "complete"} onChange={(event) => setImportStrategy(event.target.value)}><option value="fill_empty">Completar campos vacíos</option><option value="update">Actualizar</option><option value="skip">Omitir</option></select></label>
          <label className="file-drop field-wide"><FileInput /><span>{importFile?.name ?? "Seleccionar JSON, CSV o Excel .xlsx"}</span><input type="file" accept="application/json,.json,text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => { setImportFile(event.target.files?.[0] ?? null); setImportPreview(null); setRestoreConfirmation(""); }} /></label>
        </div>
        <button className="btn" disabled={!importFile || Boolean(busy)} onClick={previewImport}><ClipboardList /> {busy === "preview" ? "Analizando…" : "Previsualizar importación"}</button>

        {importPreview ? <div className="import-preview"><CheckCircle2 /><div><strong>{isBackup ? (restorable ? "Copia verificada y restaurable" : "Copia válida, pero bloqueada") : "Archivo validado"}</strong>{isBackup ? <span>{String(previewData.total ?? 0)} registros · {Object.keys(tableCounts).length} tablas · checksum {previewData.checksum_valid ? "correcto" : "incorrecto"}</span> : <span>{String(previewData.total ?? 0)} registros · {String(previewData.duplicates ?? 0)} duplicados · {String(previewData.new ?? 0)} nuevos</span>}</div></div> : null}

        {isBackup && importPreview ? <div className="admin-stack">
          <div className="status-list"><div><ShieldCheck /> La restauración recupera los datos incluidos sin borrar información adicional.</div><div><ShieldCheck /> Secretos y credenciales existentes se conservan y nunca se importan desde el archivo.</div>{missingAuth.length ? <div>Faltan {missingAuth.length} cuentas de acceso necesarias; la restauración está bloqueada.</div> : <div><ShieldCheck /> Todas las identidades Auth requeridas existen.</div>}</div>
          <label className="field"><span>Confirmación</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value.toUpperCase())} placeholder="Escribe RESTAURAR" autoComplete="off" /></label>
        </div> : null}

        {importPreview?.status === "validated" ? <button className="btn" disabled={Boolean(busy) || !restorable || (isBackup && restoreConfirmation !== "RESTAURAR")} onClick={applyImport}><DatabaseBackup /> {busy === "apply" ? "Aplicando…" : isBackup ? "Restaurar copia" : "Aplicar importación"}</button> : null}
        {importPreview?.status === "failed" ? <p className="error">{importPreview.error_message || "La operación se revirtió y no se aplicaron cambios parciales."}</p> : null}
      </article>
    </div>

    {transfers.length ? <article className="card pad"><div className="card-head"><h2>Historial de transferencias</h2><span>{transfers.length}</span></div><div className="transfer-list">{transfers.map((job) => <div key={job.id}><span className={`badge ${job.status === "completed" ? "portal" : ""}`}>{job.status === "validated" ? "Validada" : job.status === "completed" ? "Completada" : job.status}</span><strong>{job.file_name || job.domain}</strong><small>{job.format.toUpperCase()} · {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(job.created_at))}</small>{job.status === "validated" ? <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => { setImportPreview(job); setRestoreConfirmation(""); }}>Continuar importación</button> : null}</div>)}</div></article> : null}

    <AdminDataReset client={client} refresh={refresh} notify={notify} />
  </section>;
}
