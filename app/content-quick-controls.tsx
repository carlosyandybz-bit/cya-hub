"use client";

import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./content-quick-controls.module.css";

export type StatusOption = readonly [value: string, label: string];

export function ContentStatusControl({
  value,
  options,
  label = "Estado",
  disabled = false,
  onChange,
}: {
  value: string;
  options: readonly StatusOption[];
  label?: string;
  disabled?: boolean;
  onChange: (value: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const currentLabel = options.find(([candidate]) => candidate === value)?.[1] ?? value;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function choose(next: string) {
    if (next === value) { setOpen(false); return; }
    setSaving(true); setOpen(false);
    await onChange(next);
    setSaving(false);
  }

  return <div className={styles.status} ref={host}>
    <button type="button" data-state={value} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${currentLabel}`} disabled={disabled || saving} onClick={() => setOpen((current) => !current)}><span>{saving ? "Guardando…" : currentLabel}</span><ChevronDown /></button>
    {open ? <div className={styles.statusMenu} role="listbox" aria-label={label}>{options.map(([option, optionLabel]) => <button type="button" role="option" aria-selected={option === value} key={option} onClick={() => void choose(option)}><span>{optionLabel}</span>{option === value ? <Check /> : null}</button>)}</div> : null}
  </div>;
}

function QuickRange({ label, value, disabled, onCommit }: { label: string; value: number | null; disabled: boolean; onCommit: (value: number) => void | Promise<void> }) {
  const [draft, setDraft] = useState(value ?? 0);
  const lastSaved = useRef(value);

  function commit() {
    if (lastSaved.current === draft) return;
    lastSaved.current = draft;
    void onCommit(draft);
  }

  function nudge(delta: number) {
    const next = Math.max(0, Math.min(100, draft + delta));
    setDraft(next); lastSaved.current = next; void onCommit(next);
  }

  return <div className={styles.range}>
    <div><span>{label}</span><strong>{value === null && draft === 0 ? "Sin valorar" : draft}</strong></div>
    <div className={styles.rangeControl}><button type="button" aria-label={`Reducir ${label.toLocaleLowerCase("es")}`} disabled={disabled || draft <= 0} onClick={() => nudge(-25)}><Minus /></button><input type="range" min={0} max={100} step={25} value={draft} disabled={disabled} aria-label={label} onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /><button type="button" aria-label={`Aumentar ${label.toLocaleLowerCase("es")}`} disabled={disabled || draft >= 100} onClick={() => nudge(25)}><Plus /></button></div>
  </div>;
}

export function CorrectionQuickControls({
  status,
  statusOptions,
  frequency,
  importance,
  measurementMode,
  disabled = false,
  onStatus,
  onFrequency,
  onImportance,
}: {
  status: string;
  statusOptions: readonly StatusOption[];
  frequency: number | null;
  importance: number | null;
  measurementMode: "frequency" | "importance" | "both" | "none";
  disabled?: boolean;
  onStatus: (value: string) => void | Promise<void>;
  onFrequency: (value: number) => void | Promise<void>;
  onImportance: (value: number) => void | Promise<void>;
}) {
  return <div className={styles.correctionControls}>
    <ContentStatusControl value={status} options={statusOptions} disabled={disabled} onChange={onStatus} />
    {measurementMode === "frequency" || measurementMode === "both" ? <QuickRange key={`frequency-${frequency ?? "unset"}`} label="Frecuencia" value={frequency} disabled={disabled} onCommit={onFrequency} /> : null}
    {measurementMode === "importance" || measurementMode === "both" ? <QuickRange key={`importance-${importance ?? "unset"}`} label="Importancia" value={importance} disabled={disabled} onCommit={onImportance} /> : null}
  </div>;
}
