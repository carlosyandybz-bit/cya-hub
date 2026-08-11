"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./runtime-form.module.css";

export type RuntimeFormMode = "complete_missing" | "edit" | "review";

type RuntimeOption = { value: string | number | boolean; label?: string; key?: string } | string | number | boolean;
export type RuntimeFormField = {
  field_key: string;
  field_type: "information" | "text" | "textarea" | "select" | "multiselect" | "checkbox" | "number" | "date" | "email" | "phone" | "hidden" | "search";
  label: string;
  help_text: string | null;
  required: boolean;
  canonical_path: string | null;
  options: RuntimeOption[];
  visibility: Record<string, unknown>;
  condition: Record<string, unknown>;
  validation: Record<string, unknown>;
  sort_order: number;
  value: unknown;
  known: boolean;
  ask: boolean;
  writable: boolean;
};

export type RuntimeFormPayload = {
  form_id: number;
  form_key: string;
  version_id: number;
  version_number: number;
  title: string;
  description: string | null;
  context_key: string;
  form_type: string;
  person_id: number | null;
  mode: RuntimeFormMode;
  fields: RuntimeFormField[];
};

type Props = {
  client: SupabaseClient;
  formKey: string;
  personId?: number | null;
  mode?: RuntimeFormMode;
  submitLabel?: string;
  compact?: boolean;
  onSaved?: (result: Record<string, unknown>) => Promise<void> | void;
};

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function optionValue(option: RuntimeOption) {
  return typeof option === "object" && option !== null ? option.value : option;
}
function optionLabel(option: RuntimeOption) {
  return typeof option === "object" && option !== null ? option.label ?? option.key ?? String(option.value) : String(option);
}

function conditionMatches(condition: Record<string, unknown>, values: Record<string, unknown>) {
  const field = typeof condition.field === "string" ? condition.field : "";
  if (!field) return true;
  const operator = typeof condition.operator === "string" ? condition.operator : "eq";
  const current = values[field];
  const expected = condition.value;
  if (operator === "eq") return JSON.stringify(current) === JSON.stringify(expected) || String(current ?? "") === String(expected ?? "");
  if (operator === "neq") return !(JSON.stringify(current) === JSON.stringify(expected) || String(current ?? "") === String(expected ?? ""));
  if (operator === "truthy") return Boolean(current) && current !== "0" && current !== "false";
  if (operator === "falsy") return !current || current === "0" || current === "false";
  if (operator === "in" && Array.isArray(expected)) return expected.map(String).includes(String(current ?? ""));
  return false;
}

function initialValue(field: RuntimeFormField) {
  if (field.field_type === "checkbox") return Boolean(field.value);
  if (field.field_type === "multiselect") return Array.isArray(field.value) ? field.value : [];
  return scalar(field.value);
}

export function RuntimeForm({ client, formKey, personId = null, mode = "complete_missing", submitLabel = "Guardar", compact = false, onSaved }: Props) {
  const [runtime, setRuntime] = useState<RuntimeFormPayload | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [showKnown, setShowKnown] = useState(mode !== "complete_missing");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const result = await client.rpc("form_runtime", { p_form_key: formKey, p_person_id: personId, p_mode: mode });
    if (result.error) { setError(result.error.message); setLoading(false); return; }
    const payload = result.data as RuntimeFormPayload;
    const next: Record<string, unknown> = {};
    payload.fields.forEach((field) => { next[field.field_key] = initialValue(field); });
    setRuntime(payload); setValues(next); setDirty(new Set()); setShowKnown(mode !== "complete_missing"); setLoading(false);
  }, [client, formKey, personId, mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleFields = useMemo(() => (runtime?.fields ?? []).filter((field) => {
    if (!conditionMatches(field.condition, values)) return false;
    if (field.field_type === "information") return true;
    return showKnown || field.ask || dirty.has(field.field_key);
  }), [runtime, values, showKnown, dirty]);
  const hiddenKnown = useMemo(() => (runtime?.fields ?? []).filter((field) => field.field_type !== "information" && field.known && !field.ask).length, [runtime]);

  function change(field: RuntimeFormField, value: unknown) {
    if (!field.writable) return;
    setValues((current) => ({ ...current, [field.field_key]: value }));
    setDirty((current) => new Set(current).add(field.field_key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runtime || mode === "review") return;
    const answers: Record<string, unknown> = {};
    dirty.forEach((key) => { answers[key] = values[key]; });
    setBusy(true); setError("");
    const result = await client.rpc("submit_form_runtime", { p_form_key: formKey, p_person_id: runtime.person_id, p_answers: answers });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    if (onSaved) await onSaved((result.data ?? {}) as Record<string, unknown>);
    await load(); setBusy(false);
  }

  if (loading) return <div className={styles.loading}><LoaderCircle className={styles.spin} size={19}/><span>Cargando datos…</span></div>;
  if (!runtime) return <p className="error">{error || "No se pudo abrir el formulario."}</p>;

  return <form className={`${styles.form} ${compact ? styles.compact : ""}`} onSubmit={submit}>
    {runtime.description ? <p className="modal-intro">{runtime.description}</p> : null}
    {mode === "complete_missing" && hiddenKnown > 0 ? <button type="button" className={styles.knownToggle} onClick={() => setShowKnown((value) => !value)}>
      <CheckCircle2 size={17}/><span>CYA ya conoce {hiddenKnown} {hiddenKnown === 1 ? "dato" : "datos"}</span>{showKnown ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}<small>{showKnown ? "Ocultar datos conocidos" : "Ver o corregir"}</small>
    </button> : null}
    <div className="fields-2">
      {visibleFields.map((field) => <RuntimeField key={field.field_key} field={field} value={values[field.field_key]} change={(value) => change(field, value)} />)}
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {mode !== "review" ? <div className="actions"><button className="btn" disabled={busy || dirty.size === 0}><CheckCircle2 size={17}/>{busy ? "Guardando…" : submitLabel}</button></div> : null}
  </form>;
}

function RuntimeField({ field, value, change }: { field: RuntimeFormField; value: unknown; change: (value: unknown) => void }) {
  const common = { name: field.field_key, disabled: !field.writable };
  if (field.field_type === "information") return <div className={`${styles.info} field-wide`}><strong>{field.label}</strong>{field.help_text ? <span>{field.help_text}</span> : null}</div>;
  if (field.field_type === "hidden") return <input type="hidden" name={field.field_key} value={scalar(value)} />;

  const label = <><span>{field.label}{field.required ? " *" : ""}{field.known ? <em className={styles.known}>Conocido</em> : null}</span>{field.help_text ? <small>{field.help_text}</small> : null}</>;
  if (field.field_type === "textarea") return <label className="field field-wide">{label}<textarea {...common} rows={3} value={scalar(value)} onChange={(event) => change(event.target.value)} /></label>;
  if (field.field_type === "checkbox") return <label className={`${styles.checkbox} field-wide`}><input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => change(event.target.checked)} /><span><strong>{field.label}</strong>{field.help_text ? <small>{field.help_text}</small> : null}</span></label>;
  if (field.field_type === "select") return <label className="field">{label}<select {...common} value={scalar(value)} onChange={(event) => change(event.target.value)}><option value="">Seleccionar</option>{field.options.map((option) => <option key={String(optionValue(option))} value={String(optionValue(option))}>{optionLabel(option)}</option>)}</select></label>;
  if (field.field_type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <fieldset className={`${styles.multi} field-wide`} disabled={!field.writable}><legend>{field.label}{field.required ? " *" : ""}</legend>{field.help_text ? <small>{field.help_text}</small> : null}<div>{field.options.map((option) => { const raw = String(optionValue(option)); return <label key={raw}><input type="checkbox" checked={selected.includes(raw)} onChange={(event) => change(event.target.checked ? [...selected, raw] : selected.filter((item) => item !== raw))}/><span>{optionLabel(option)}</span></label>; })}</div></fieldset>;
  }

  const validation = field.validation ?? {};
  const maxLength = typeof validation.max_length === "number" ? validation.max_length : undefined;
  if (field.field_type === "number") {
    const decimal = validation.decimal === true;
    return <label className="field">{label}<input {...common} type="text" inputMode={decimal ? "decimal" : "numeric"} pattern={decimal ? "[0-9]*[.,]?[0-9]*" : "-?[0-9]*"} value={scalar(value)} onChange={(event) => change(event.target.value)} /></label>;
  }
  const type = field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : field.field_type === "date" ? "date" : "text";
  const inputMode = field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : undefined;
  return <label className="field">{label}<input {...common} type={type} inputMode={inputMode} maxLength={maxLength} value={scalar(value)} onChange={(event) => change(event.target.value)} /></label>;
}
