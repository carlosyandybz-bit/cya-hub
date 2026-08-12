"use client";

import { useMemo, useState } from "react";
import styles from "./evaluation-radar.module.css";

export type EvaluationRadarItem = {
  id: number;
  label: string;
  value: number | null;
};

export type EvaluationScaleOption = {
  score: number;
  label: string;
};

export function EvaluationRadar({
  items,
  scale,
  onChange,
  busyId = null,
  readonly = false,
  emptyLabel = "Sin evaluar",
  ariaLabel = "Radar de evaluación",
}: {
  items: EvaluationRadarItem[];
  scale: EvaluationScaleOption[];
  onChange?: (itemId: number, score: number) => void;
  busyId?: number | null;
  readonly?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(items[0]?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const values = useMemo(() => items.map((item) => item.value === null ? 0 : Math.max(0, Math.min(100, Number(item.value) || 0))), [items]);
  if (items.length < 3) return <div className={styles.empty}>Se necesitan al menos tres parámetros para dibujar el radar.</div>;

  const center = 120;
  const radius = 82;
  const count = items.length;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio] as const;
  };
  const polygon = (ratio: number) => items.map((_, index) => point(index, ratio).join(",")).join(" ");
  const valuePolygon = values.map((value, index) => point(index, value / 100).join(",")).join(" ");

  function select(itemId: number) {
    if (!readonly) setSelectedId(itemId);
  }

  return <div className={`${styles.root} ${readonly ? styles.readonly : ""}`}>
    <div className={styles.visual}>
      <svg viewBox="0 0 240 240" role="img" aria-label={ariaLabel}>
        {[0.25, 0.5, 0.75, 1].map((ratio) => <polygon key={ratio} className={styles.ring} points={polygon(ratio)} />)}
        {items.map((item, index) => {
          const [x, y] = point(index, 1);
          return <line key={`axis-${item.id}`} className={styles.axis} x1={center} y1={center} x2={x} y2={y} />;
        })}
        <polygon className={styles.valueArea} points={valuePolygon} />
        {items.map((item, index) => {
          const [x, y] = point(index, values[index] / 100);
          const missing = item.value === null;
          const selectedPoint = !readonly && item.id === selected?.id;
          return <g key={item.id} role={readonly ? undefined : "button"} tabIndex={readonly ? undefined : 0} aria-label={readonly ? undefined : `${item.label}: ${missing ? emptyLabel : item.value}`} onClick={() => select(item.id)} onKeyDown={(event) => { if (!readonly && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(item.id); } }} className={readonly ? undefined : styles.pointTarget}>
            <circle className={`${styles.pointHalo} ${selectedPoint ? styles.pointHaloSelected : ""}`} cx={x} cy={y} r={selectedPoint ? 12 : 9} />
            <circle className={`${styles.point} ${missing ? styles.pointMissing : ""}`} cx={x} cy={y} r={selectedPoint ? 5.5 : 4.5} />
          </g>;
        })}
      </svg>
      <div className={styles.legend}>{items.map((item) => <button type="button" key={item.id} className={`${styles.legendItem} ${!readonly && item.id === selected?.id ? styles.legendSelected : ""}`} disabled={readonly} onClick={() => select(item.id)}><span>{item.label}</span><strong>{item.value === null ? "—" : item.value}</strong></button>)}</div>
    </div>
    {!readonly && selected ? <section className={styles.editor} aria-live="polite">
      <header><div><span>Parámetro</span><strong>{selected.label}</strong></div><b>{selected.value === null ? emptyLabel : `${selected.value}/100`}</b></header>
      <div className={styles.scale}>{scale.map((option) => <button type="button" key={option.score} className={selected.value === option.score ? styles.scaleSelected : ""} disabled={busyId === selected.id} aria-pressed={selected.value === option.score} onClick={() => onChange?.(selected.id, option.score)}><b>{option.score}</b><span>{option.label}</span></button>)}</div>
    </section> : null}
  </div>;
}
