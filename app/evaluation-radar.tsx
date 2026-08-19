"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Star } from "lucide-react";
import styles from "./evaluation-radar.module.css";

export type EvaluationRadarItem = {
  id: number;
  label: string;
  /** 0-100 radial position. For the new evaluation model this is normally milestone progress, not the raw score. */
  value: number | null;
  score?: number | null;
  stars?: number;
  totalStars?: number;
  milestoneLabel?: string | null;
  delta?: number | null;
};

export type EvaluationScaleOption = {
  score: number;
  label: string;
};

type Mode = "teacher" | "student";

function trendFor(delta:number|null|undefined){
  if(delta===null||delta===undefined)return {kind:"none" as const,label:"Sin referencia",Icon:ArrowRight};
  if(delta>0)return {kind:"up" as const,label:`+${delta}`,Icon:ArrowUpRight};
  if(delta<0)return {kind:"down" as const,label:String(delta),Icon:ArrowDownRight};
  return {kind:"flat" as const,label:"0",Icon:ArrowRight};
}

function Stars({earned,total}:{earned:number;total:number}){
  if(total<=0)return <span className={styles.noMilestones}>Sin hitos</span>;
  return <span className={styles.stars} aria-label={`${earned} de ${total} hitos`}>
    {Array.from({length:total},(_,index)=><Star key={index} size={14} aria-hidden="true" data-earned={index<earned} />)}
    <b>{earned}/{total}</b>
  </span>;
}

export function EvaluationRadar({
  items,
  scale,
  onChange,
  busyId = null,
  readonly = false,
  emptyLabel = "Sin evaluar",
  ariaLabel = "Radar de evaluación",
  mode = readonly ? "student" : "teacher",
  showEditor = !readonly,
}: {
  items: EvaluationRadarItem[];
  scale: EvaluationScaleOption[];
  onChange?: (itemId: number, score: number) => void;
  busyId?: number | null;
  readonly?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
  mode?: Mode;
  showEditor?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(items[0]?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const values = useMemo(() => items.map((item) => item.value === null ? 0 : Math.max(0, Math.min(100, Number(item.value) || 0))), [items]);
  if (items.length < 3) return <div className={styles.empty}>Se necesitan al menos tres parámetros para dibujar la evaluación.</div>;

  const center = 150;
  const radius = 104;
  const count = items.length;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio] as const;
  };
  const polygon = (ratio: number) => items.map((_, index) => point(index, ratio).join(",")).join(" ");
  const valuePolygon = values.map((value, index) => point(index, value / 100).join(",")).join(" ");

  function select(itemId: number) {
    if (mode === "teacher") setSelectedId(itemId);
  }

  return <div className={`${styles.root} ${readonly ? styles.readonly : ""}`} data-mode={mode}>
    <div className={styles.visual}>
      <div className={styles.chartWrap}>
        <svg viewBox="0 0 300 300" role="img" aria-label={ariaLabel}>
          {[0.25, 0.5, 0.75, 1].map((ratio) => <polygon key={ratio} className={styles.ring} points={polygon(ratio)} />)}
          {items.map((item, index) => {
            const [x, y] = point(index, 1);
            return <line key={`axis-${item.id}`} className={styles.axis} x1={center} y1={center} x2={x} y2={y} />;
          })}
          <polygon className={styles.valueArea} points={valuePolygon} />
          {items.map((item, index) => {
            const [x, y] = point(index, values[index] / 100);
            const missing = item.value === null;
            const selectedPoint = mode === "teacher" && item.id === selected?.id;
            return <g key={item.id} role={mode === "teacher" ? "button" : undefined} tabIndex={mode === "teacher" ? 0 : undefined} aria-label={mode === "teacher" ? `${item.label}: ${missing ? emptyLabel : item.value}` : undefined} onClick={() => select(item.id)} onKeyDown={(event) => { if (mode === "teacher" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(item.id); } }} className={mode === "teacher" ? styles.pointTarget : undefined}>
              <circle className={`${styles.pointHalo} ${selectedPoint ? styles.pointHaloSelected : ""}`} cx={x} cy={y} r={selectedPoint ? 13 : 10} />
              <circle className={`${styles.point} ${missing ? styles.pointMissing : ""}`} cx={x} cy={y} r={selectedPoint ? 6 : 5} />
            </g>;
          })}
        </svg>
      </div>
      <div className={styles.legend}>{items.map((item) => {
        const trend=trendFor(item.delta); const TrendIcon=trend.Icon; const earned=Math.max(0,item.stars??0),total=Math.max(0,item.totalStars??0);
        return <button type="button" key={item.id} className={`${styles.legendItem} ${mode === "teacher" && item.id === selected?.id ? styles.legendSelected : ""}`} disabled={mode !== "teacher"} onClick={() => select(item.id)}>
          <span className={styles.legendTitle}>{item.label}</span>
          <Stars earned={earned} total={total}/>
          {mode === "teacher" ? <>
            <span className={styles.milestone}>{item.milestoneLabel || "Aún sin hito alcanzado"}</span>
            <span className={styles.teacherMetrics}><b>{item.score===null||item.score===undefined?"—":item.score}</b><i data-trend={trend.kind}><TrendIcon size={14}/>{trend.label}</i></span>
          </> : <span className={styles.studentTrend} data-trend={trend.kind}><TrendIcon size={16}/><span>{trend.kind==="up"?"Mejora":trend.kind==="down"?"Revisar":trend.kind==="flat"?"Estable":"Sin referencia"}</span></span>}
        </button>;
      })}</div>
    </div>
    {mode === "teacher" && showEditor && selected ? <section className={styles.editor} aria-live="polite">
      <header><div><span>Capacidad seleccionada</span><strong>{selected.label}</strong><small>{selected.milestoneLabel || "Sin hito aceptado todavía"}</small></div><div className={styles.editorSummary}><Stars earned={selected.stars??0} total={selected.totalStars??0}/><b>{selected.score===null||selected.score===undefined?emptyLabel:`${selected.score}/100`}</b></div></header>
      {scale.length ? <div className={styles.scale}>{scale.map((option) => <button type="button" key={option.score} className={selected.score === option.score ? styles.scaleSelected : ""} disabled={busyId === selected.id} aria-pressed={selected.score === option.score} onClick={() => onChange?.(selected.id, option.score)}><b>{option.score}</b><span>{option.label}</span></button>)}</div> : null}
    </section> : null}
  </div>;
}
