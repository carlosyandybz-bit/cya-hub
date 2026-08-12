"use client";

import { Eye, EyeOff, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import styles from "./live-class-controls.module.css";

export type LiveMetricValue = 0 | 25 | 50 | 75 | 100;
export type LiveContentKind = "correction" | "explanation" | "exercise" | "sequence";
export type LiveStatusOption = { value: string; label: string; tone: "neutral" | "danger" | "success" };
export type LiveAnnotation = { id: number; body: string; visible: boolean } | null;

export const frequencyLevels: ReadonlyArray<{ value: LiveMetricValue; label: string; level: string }> = [
  { value: 0, label: "Rara vez", level: "Mínima" },
  { value: 25, label: "Ocasionalmente", level: "Baja" },
  { value: 50, label: "A veces", level: "Media" },
  { value: 75, label: "A menudo", level: "Alta" },
  { value: 100, label: "Casi siempre", level: "Máxima" },
];

export const importanceLevels: ReadonlyArray<{ value: LiveMetricValue; label: string; level: string }> = [
  { value: 0, label: "Mínima", level: "Mínima" },
  { value: 25, label: "Baja", level: "Baja" },
  { value: 50, label: "Media", level: "Media" },
  { value: 75, label: "Alta", level: "Alta" },
  { value: 100, label: "Máxima", level: "Máxima" },
];

export function nearestMetricValue(value: number | null | undefined): LiveMetricValue | null {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const numeric = Math.max(0, Math.min(100, Number(value)));
  return ([0, 25, 50, 75, 100] as const).reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 0 as LiveMetricValue);
}

function closePicker(target: HTMLElement) {
  target.closest("details")?.removeAttribute("open");
}

function MetricPicker({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: "frequency" | "importance";
  value: number | null;
  onChange: (value: LiveMetricValue | null) => void;
  disabled?: boolean;
}) {
  const normalized = nearestMetricValue(value);
  const levels = kind === "frequency" ? frequencyLevels : importanceLevels;
  const selected = normalized === null ? null : levels.find((item) => item.value === normalized) ?? null;
  const title = kind === "frequency" ? "Frecuencia" : "Importancia";
  return <details className={styles.picker}>
    <summary
      className={`${styles.metricChip} ${normalized === null ? styles.metricEmpty : styles[`metric${normalized}`]}`}
      aria-label={`${title}: ${selected?.label ?? "sin valorar"}`}
    >
      <span>{title}</span>
      <strong>{selected?.label ?? "Sin valorar"}</strong>
    </summary>
    <div className={styles.pickerMenu}>
      <button type="button" disabled={disabled} className={normalized === null ? styles.selectedOption : ""} onClick={(event) => { onChange(null); closePicker(event.currentTarget); }}>Sin valorar</button>
      {levels.map((item) => <button
        type="button"
        key={item.value}
        disabled={disabled}
        className={normalized === item.value ? styles.selectedOption : ""}
        onClick={(event) => { onChange(item.value); closePicker(event.currentTarget); }}
      ><span>{item.label}</span><small>{item.level}</small></button>)}
    </div>
  </details>;
}

function MissingMetrics({
  showFrequency,
  showImportance,
  frequency,
  importance,
  onFrequency,
  onImportance,
  disabled,
}: {
  showFrequency: boolean;
  showImportance: boolean;
  frequency: number | null;
  importance: number | null;
  onFrequency?: (value: LiveMetricValue | null) => void;
  onImportance?: (value: LiveMetricValue | null) => void;
  disabled?: boolean;
}) {
  const missingFrequency = showFrequency && frequency === null && Boolean(onFrequency);
  const missingImportance = showImportance && importance === null && Boolean(onImportance);
  if (!missingFrequency && !missingImportance) return null;
  return <details className={`${styles.picker} ${styles.addMetricPicker}`}>
    <summary><Plus /> Valorar</summary>
    <div className={`${styles.pickerMenu} ${styles.missingMenu}`}>
      {missingFrequency ? <section><strong>Frecuencia</strong>{frequencyLevels.map((item) => <button type="button" key={`frequency-${item.value}`} disabled={disabled} onClick={(event) => { onFrequency?.(item.value); closePicker(event.currentTarget); }}><span>{item.label}</span><small>{item.level}</small></button>)}</section> : null}
      {missingImportance ? <section><strong>Importancia</strong>{importanceLevels.map((item) => <button type="button" key={`importance-${item.value}`} disabled={disabled} onClick={(event) => { onImportance?.(item.value); closePicker(event.currentTarget); }}><span>{item.label}</span><small>{item.level}</small></button>)}</section> : null}
    </div>
  </details>;
}

function StatusPicker({ value, options, onChange, disabled }: { value: string; options: readonly LiveStatusOption[]; onChange?: (value: string) => void; disabled?: boolean }) {
  const option = options.find((item) => item.value === value) ?? options[0];
  return <details className={`${styles.picker} ${styles.statusPicker}`}>
    <summary className={`${styles.statusChip} ${styles[`status_${option.tone}`]}`}>{option.label}</summary>
    {onChange ? <div className={styles.pickerMenu}>{options.map((item) => <button type="button" key={item.value} disabled={disabled} className={value === item.value ? styles.selectedOption : ""} onClick={(event) => { onChange(item.value); closePicker(event.currentTarget); }}>{item.label}</button>)}</div> : null}
  </details>;
}

function AnnotationEditor({ annotation, onSave, disabled }: { annotation: LiveAnnotation; onSave?: (body: string, visible: boolean) => void; disabled?: boolean }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSave) return;
    const data = new FormData(event.currentTarget);
    onSave(String(data.get("body") ?? "").trim(), data.get("visible") === "on");
  };
  return <details className={`${styles.annotation} ${annotation?.body ? styles.annotationFilled : ""}`}>
    <summary>
      <span>{annotation?.body || "Añadir observación al alumno"}</span>
      <b>{annotation?.visible ? <><Eye /> Visible</> : <><EyeOff /> Privada</>}</b>
    </summary>
    {onSave ? <form onSubmit={submit}>
      <textarea name="body" defaultValue={annotation?.body ?? ""} rows={3} placeholder="Observación sobre este contenido para este alumno…" />
      <label className={styles.visibilityToggle}><input type="checkbox" name="visible" defaultChecked={annotation?.visible ?? false} /><span>Visible para el alumno al cerrar la clase</span></label>
      <button type="submit" disabled={disabled}>Guardar observación</button>
    </form> : null}
  </details>;
}

export function LiveContentControls({
  status,
  statusOptions,
  onStatus,
  showFrequency = false,
  showImportance = false,
  frequency = null,
  importance = null,
  onFrequency,
  onImportance,
  annotation = null,
  onAnnotation,
  disabled = false,
}: {
  status: string;
  statusOptions: readonly LiveStatusOption[];
  onStatus?: (value: string) => void;
  showFrequency?: boolean;
  showImportance?: boolean;
  frequency?: number | null;
  importance?: number | null;
  onFrequency?: (value: LiveMetricValue | null) => void;
  onImportance?: (value: LiveMetricValue | null) => void;
  annotation?: LiveAnnotation;
  onAnnotation?: (body: string, visible: boolean) => void;
  disabled?: boolean;
}) {
  return <div className={styles.controls}>
    <div className={styles.chipRow}>
      <StatusPicker value={status} options={statusOptions} onChange={onStatus} disabled={disabled} />
      {showFrequency && frequency !== null ? <MetricPicker kind="frequency" value={frequency} onChange={(value) => onFrequency?.(value)} disabled={disabled} /> : null}
      {showImportance && importance !== null ? <MetricPicker kind="importance" value={importance} onChange={(value) => onImportance?.(value)} disabled={disabled} /> : null}
      <MissingMetrics showFrequency={showFrequency} showImportance={showImportance} frequency={frequency} importance={importance} onFrequency={onFrequency} onImportance={onImportance} disabled={disabled} />
    </div>
    <AnnotationEditor key={annotation?.id ?? "empty"} annotation={annotation} onSave={onAnnotation} disabled={disabled} />
  </div>;
}

function MetricChoice({ kind, value, selected, onSelect }: { kind: "frequency" | "importance"; value: LiveMetricValue; selected: LiveMetricValue | null; onSelect: (value: LiveMetricValue) => void }) {
  const source = kind === "frequency" ? frequencyLevels : importanceLevels;
  const item = source.find((candidate) => candidate.value === value)!;
  return <button type="button" className={`${styles.modalMetricChoice} ${selected === value ? styles.modalMetricSelected : ""} ${styles[`metric${value}`]}`} onClick={() => onSelect(value)}><strong>{item.label}</strong><small>{item.level}</small></button>;
}

export function LiveQuickCreateModal({
  open,
  kind,
  title,
  frequency,
  importance,
  busy,
  onClose,
  onKind,
  onTitle,
  onFrequency,
  onImportance,
  onCreate,
}: {
  open: boolean;
  kind: LiveContentKind;
  title: string;
  frequency: LiveMetricValue | null;
  importance: LiveMetricValue | null;
  busy?: boolean;
  onClose: () => void;
  onKind: (kind: LiveContentKind) => void;
  onTitle: (title: string) => void;
  onFrequency: (value: LiveMetricValue | null) => void;
  onImportance: (value: LiveMetricValue | null) => void;
  onCreate: () => void;
}) {
  if (!open) return null;
  const kinds: Array<{ value: LiveContentKind; label: string }> = [
    { value: "correction", label: "Corrección" },
    { value: "explanation", label: "Contenido" },
    { value: "exercise", label: "Ejercicio" },
    { value: "sequence", label: "Secuencia" },
  ];
  return <div className={styles.modalBackdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Crear contenido durante la clase">
      <header><div><span>Crear desde la búsqueda</span><h2>Nuevo contenido</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X /></button></header>
      <div className={styles.modalBody}>
        <div className={styles.kindGrid}>{kinds.map((item) => <button type="button" key={item.value} className={kind === item.value ? styles.kindSelected : ""} onClick={() => onKind(item.value)}>{item.label}</button>)}</div>
        <label className={styles.titleField}><span>Nombre</span><input value={title} onChange={(event) => onTitle(event.target.value)} autoFocus placeholder="Nombre del contenido" /><small>Se hereda de lo que estabas buscando y puedes editarlo.</small></label>
        <section className={styles.metricSection}><div><strong>Frecuencia</strong><button type="button" className={frequency === null ? styles.noValueSelected : ""} onClick={() => onFrequency(null)}>Sin valor</button></div><div className={styles.modalMetricGrid}>{frequencyLevels.map((item) => <MetricChoice key={item.value} kind="frequency" value={item.value} selected={frequency} onSelect={onFrequency} />)}</div></section>
        <section className={styles.metricSection}><div><strong>Importancia</strong><button type="button" className={importance === null ? styles.noValueSelected : ""} onClick={() => onImportance(null)}>Sin valor</button></div><div className={styles.modalMetricGrid}>{importanceLevels.map((item) => <MetricChoice key={item.value} kind="importance" value={item.value} selected={importance} onSelect={onImportance} />}</div></section>
        <p className={styles.measurementHint}>Todo contenido creado durante una clase queda preparado para medir <strong>frecuencia + importancia</strong>. Si no eliges un valor, esa etiqueta no aparecerá en la tarjeta contraída.</p>
      </div>
      <footer><button type="button" className={styles.cancel} onClick={onClose}>Cancelar</button><button type="button" className={styles.create} disabled={busy || !title.trim()} onClick={onCreate}>{busy ? "Guardando…" : "Crear y añadir"}</button></footer>
    </section>
  </div>;
}
