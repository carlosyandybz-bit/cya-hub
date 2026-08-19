"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Filter, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./statistics-view.module.css";

type PersonRow = {
  person_id: number;
  display_name: string;
  internal_alias: string | null;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  city: string | null;
  age: number | null;
  is_registered: boolean;
  reservation_count: number;
  has_reserved: boolean;
  next_class_at: string | null;
  last_class_at: string | null;
  interest_states: Record<string, string>;
  has_any_interest: boolean;
  interested_in_person_classes: boolean;
  primary_no_booking_reason: string | null;
  no_booking_reason_missing: boolean;
  has_next_class: boolean;
  interested_in_online_content: boolean;
  interested_in_teacher_training: boolean;
  interested_in_wedding: boolean;
  interested_in_online_feedback: boolean;
  questionnaire_finalized: boolean;
  questionnaire_pending_with_next_class: boolean;
};

type SavedView = {
  id: number;
  view_key: string | null;
  name: string;
  filters: Record<string, unknown>;
  is_system: boolean;
};

type MetricKey = "people_count" | "percentage_total" | "average_age" | "reserved_count" | "reservation_rate" | "next_class_count" | "questionnaire_pending_count";

type Panel = {
  id: number;
  title: string;
  description: string | null;
  metric_key: MetricKey;
  filters: Record<string, unknown>;
  display_order: number;
};

type TriState = "all" | "yes" | "no";

type BuilderState = {
  title: string;
  description: string;
  metric: MetricKey;
  baseView: string;
  query: string;
  reservation: TriState;
  classInterest: "all" | "interested" | "not_interested" | "unknown";
  nextClass: TriState;
  questionnaire: "all" | "finished" | "pending";
  onlineInterest: TriState;
  teacherTrainingInterest: TriState;
  minAge: string;
  maxAge: string;
  location: string;
  noBookingReason: string;
};

const emptyBuilder: BuilderState = {
  title: "",
  description: "",
  metric: "people_count",
  baseView: "",
  query: "",
  reservation: "all",
  classInterest: "all",
  nextClass: "all",
  questionnaire: "all",
  onlineInterest: "all",
  teacherTrainingInterest: "all",
  minAge: "",
  maxAge: "",
  location: "",
  noBookingReason: "",
};

const metrics: Array<{ key: MetricKey; label: string; help: string }> = [
  { key: "people_count", label: "Cantidad de personas", help: "Número de personas que cumplen todos los filtros." },
  { key: "percentage_total", label: "% del total de personas", help: "Qué porcentaje del CRM completo representa el segmento." },
  { key: "average_age", label: "Edad media", help: "Edad media de las personas filtradas que tienen fecha de nacimiento." },
  { key: "reserved_count", label: "Personas que han reservado", help: "Personas del segmento con al menos una reserva/clase real." },
  { key: "reservation_rate", label: "Tasa de reserva", help: "Porcentaje del segmento que ha reservado realmente." },
  { key: "next_class_count", label: "Personas con próxima clase", help: "Personas del segmento que tienen una clase futura." },
  { key: "questionnaire_pending_count", label: "Cuestionario pendiente + próxima clase", help: "Personas del segmento con próxima clase y cuestionario opcional pendiente." },
];

const reasonLabels: Record<string, string> = {
  price: "Precio",
  own_availability: "Disponibilidad del alumno",
  cya_availability: "Disponibilidad de CYA",
  incompatible_schedules: "Horarios incompatibles",
  location_distance: "Localidad / distancia",
  temporary_stay: "Estancia temporal",
  later: "Más adelante",
  thinking: "Lo está pensando",
  no_longer_interested: "Ya no tiene interés",
  no_response: "No responde",
  other: "Otro",
};

function rowSearch(row: PersonRow, needle: string) {
  const normalized = needle.trim().toLocaleLowerCase("es");
  if (!normalized) return true;
  return [row.display_name, row.internal_alias, row.email, row.phone]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("es").includes(normalized));
}

function matchesFilters(row: PersonRow, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, expected]) => {
    if (key === "registered") return row.is_registered === Boolean(expected);
    if (key === "interest_classified") return (Object.keys(row.interest_states ?? {}).length > 0) === Boolean(expected);
    if (key === "interested_in_person_classes") return row.interested_in_person_classes === Boolean(expected);
    if (key === "interested_in_online_content") return row.interested_in_online_content === Boolean(expected);
    if (key === "interested_in_teacher_training") return row.interested_in_teacher_training === Boolean(expected);
    if (key === "interested_in_wedding") return row.interested_in_wedding === Boolean(expected);
    if (key === "interested_in_online_feedback") return row.interested_in_online_feedback === Boolean(expected);
    if (key === "has_reserved") return row.has_reserved === Boolean(expected);
    if (key === "has_next_class") return row.has_next_class === Boolean(expected);
    if (key === "questionnaire_finalized") return row.questionnaire_finalized === Boolean(expected);
    if (key === "questionnaire_pending_with_next_class") return row.questionnaire_pending_with_next_class === Boolean(expected);
    if (key === "no_booking_reason_missing") return row.no_booking_reason_missing === Boolean(expected);
    if (key === "primary_no_booking_reason") return row.primary_no_booking_reason === expected;
    if (key === "query") return rowSearch(row, String(expected ?? ""));
    if (key === "reservation") return expected === "all" || row.has_reserved === (expected === "yes");
    if (key === "class_interest") return expected === "all" || (row.interest_states?.in_person_classes ?? "unknown") === expected;
    if (key === "min_age") return expected === null || expected === "" || (row.age !== null && row.age >= Number(expected));
    if (key === "max_age") return expected === null || expected === "" || (row.age !== null && row.age <= Number(expected));
    if (key === "location") {
      const place = String(expected ?? "").trim().toLocaleLowerCase("es");
      return !place || `${row.city ?? ""} ${row.country_code ?? ""}`.toLocaleLowerCase("es").includes(place);
    }
    return true;
  });
}

function metricValue(metric: MetricKey, segment: PersonRow[], allRows: PersonRow[]) {
  if (metric === "people_count") return segment.length;
  if (metric === "percentage_total") return allRows.length ? (segment.length / allRows.length) * 100 : null;
  if (metric === "average_age") {
    const ages = segment.map((row) => row.age).filter((value): value is number => value !== null && Number.isFinite(value));
    return ages.length ? ages.reduce((sum, value) => sum + value, 0) / ages.length : null;
  }
  if (metric === "reserved_count") return segment.filter((row) => row.has_reserved).length;
  if (metric === "reservation_rate") return segment.length ? (segment.filter((row) => row.has_reserved).length / segment.length) * 100 : null;
  if (metric === "next_class_count") return segment.filter((row) => row.has_next_class).length;
  if (metric === "questionnaire_pending_count") return segment.filter((row) => row.questionnaire_pending_with_next_class).length;
  return null;
}

function formatMetric(metric: MetricKey, value: number | null) {
  if (value === null) return "Sin datos";
  if (metric === "percentage_total" || metric === "reservation_rate") return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} %`;
  if (metric === "average_age") return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} años`;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

function metricLabel(metric: MetricKey) {
  return metrics.find((item) => item.key === metric)?.label ?? metric;
}

function filterSummary(filters: Record<string, unknown>) {
  const parts: string[] = [];
  if (filters.reservation === "yes" || filters.has_reserved === true) parts.push("con reserva");
  if (filters.reservation === "no" || filters.has_reserved === false) parts.push("sin reserva");
  if (filters.class_interest === "interested" || filters.interested_in_person_classes === true) parts.push("interés en clases");
  if (filters.class_interest === "not_interested") parts.push("sin interés en clases");
  if (filters.has_next_class === true) parts.push("con próxima clase");
  if (filters.has_next_class === false) parts.push("sin próxima clase");
  if (filters.questionnaire_pending_with_next_class === true) parts.push("cuestionario pendiente");
  if (filters.interested_in_online_content === true) parts.push("contenido online");
  if (filters.interested_in_teacher_training === true) parts.push("formación profesores");
  if (filters.min_age) parts.push(`≥ ${filters.min_age} años`);
  if (filters.max_age) parts.push(`≤ ${filters.max_age} años`);
  if (filters.location) parts.push(String(filters.location));
  if (filters.primary_no_booking_reason) parts.push(reasonLabels[String(filters.primary_no_booking_reason)] ?? String(filters.primary_no_booking_reason));
  if (filters.query) parts.push(`“${String(filters.query)}”`);
  return parts.length ? parts.join(" · ") : "Todas las personas";
}

export function StatisticsCrmDashboard({ client, notify }: { client: SupabaseClient; notify: (message: string) => void }) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [builder, setBuilder] = useState<BuilderState>(emptyBuilder);
  const [openBuilder, setOpenBuilder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [peopleResult, viewsResult, panelsResult] = await Promise.all([
      client.rpc("crm_person_explorer_snapshot"),
      client.rpc("crm_saved_views_snapshot"),
      client.rpc("crm_stat_panels_snapshot"),
    ]);
    const firstError = peopleResult.error ?? viewsResult.error ?? panelsResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setRows((peopleResult.data ?? []) as PersonRow[]);
    setViews((viewsResult.data ?? []) as SavedView[]);
    setPanels((panelsResult.data ?? []) as Panel[]);
    setLoading(false);
  }, [client]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onRefresh = (event: Event) => {
      const promise = load();
      (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail?.waitUntil?.(promise);
    };
    window.addEventListener("cya:refresh", onRefresh);
    return () => window.removeEventListener("cya:refresh", onRefresh);
  }, [load]);

  const selectedView = views.find((view) => `${view.is_system ? "system" : "personal"}:${view.id}` === builder.baseView) ?? null;
  const builderFilters = useMemo<Record<string, unknown>>(() => ({
    ...(selectedView?.filters ?? {}),
    ...(builder.query.trim() ? { query: builder.query.trim() } : {}),
    ...(builder.reservation !== "all" ? { reservation: builder.reservation } : {}),
    ...(builder.classInterest !== "all" ? { class_interest: builder.classInterest } : {}),
    ...(builder.nextClass !== "all" ? { has_next_class: builder.nextClass === "yes" } : {}),
    ...(builder.questionnaire === "finished" ? { questionnaire_finalized: true } : {}),
    ...(builder.questionnaire === "pending" ? { questionnaire_pending_with_next_class: true } : {}),
    ...(builder.onlineInterest !== "all" ? { interested_in_online_content: builder.onlineInterest === "yes" } : {}),
    ...(builder.teacherTrainingInterest !== "all" ? { interested_in_teacher_training: builder.teacherTrainingInterest === "yes" } : {}),
    ...(builder.minAge ? { min_age: Number(builder.minAge) } : {}),
    ...(builder.maxAge ? { max_age: Number(builder.maxAge) } : {}),
    ...(builder.location.trim() ? { location: builder.location.trim() } : {}),
    ...(builder.noBookingReason ? { primary_no_booking_reason: builder.noBookingReason } : {}),
  }), [builder, selectedView]);

  const previewRows = useMemo(() => rows.filter((row) => matchesFilters(row, builderFilters)), [builderFilters, rows]);
  const previewValue = useMemo(() => metricValue(builder.metric, previewRows, rows), [builder.metric, previewRows, rows]);

  async function savePanel() {
    const title = builder.title.trim() || metricLabel(builder.metric);
    setSaving(true);
    setError("");
    const result = await client.rpc("save_crm_stat_panel", {
      p_panel_id: null,
      p_title: title,
      p_description: builder.description.trim() || null,
      p_metric_key: builder.metric,
      p_filters: builderFilters,
      p_display_order: panels.length,
    });
    if (result.error) setError(result.error.message);
    else {
      notify("Panel de estadísticas guardado");
      setBuilder(emptyBuilder);
      setOpenBuilder(false);
      await load();
    }
    setSaving(false);
  }

  async function deletePanel(id: number) {
    setError("");
    const result = await client.rpc("delete_crm_stat_panel", { p_panel_id: id });
    if (result.error) setError(result.error.message);
    else {
      notify("Panel eliminado");
      await load();
    }
  }

  return <section className={styles.crmDashboard} aria-labelledby="crm-statistics-title">
    <div className={styles.dashboardHead}>
      <div>
        <span className={styles.sectionEyebrow}>CRM + Estadísticas</span>
        <h2 id="crm-statistics-title">Mis paneles de estadísticas</h2>
        <p>Crea indicadores con cualquier combinación de filtros del CRM. El valor se recalcula automáticamente cuando cambian las personas, reservas o datos.</p>
      </div>
      <div className={styles.dashboardActions}>
        <button type="button" onClick={() => setOpenBuilder((value) => !value)} aria-expanded={openBuilder}><Plus /> Crear panel</button>
        <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Actualizar paneles"><RefreshCw /></button>
      </div>
    </div>

    {error ? <div className={styles.dashboardError} role="alert">{error}</div> : null}

    {openBuilder ? <div className={styles.panelBuilder}>
      <div className={styles.builderHeading}>
        <div><span>Nuevo panel</span><strong>Selecciona qué quieres medir y sobre qué personas.</strong></div>
        <div className={styles.previewValue}><small>Vista previa</small><strong>{formatMetric(builder.metric, previewValue)}</strong><span>{previewRows.length} personas cumplen el filtro</span></div>
      </div>

      <div className={styles.builderGrid}>
        <label><span>Título del panel</span><input value={builder.title} onChange={(event) => setBuilder((value) => ({ ...value, title: event.target.value }))} placeholder={metricLabel(builder.metric)} /></label>
        <label><span>Valor a mostrar</span><select value={builder.metric} onChange={(event) => setBuilder((value) => ({ ...value, metric: event.target.value as MetricKey }))}>{metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select><small>{metrics.find((metric) => metric.key === builder.metric)?.help}</small></label>
        <label><span>Partir de una lista CRM</span><select value={builder.baseView} onChange={(event) => setBuilder((value) => ({ ...value, baseView: event.target.value }))}><option value="">Todas las personas</option>{views.map((view) => <option key={view.id} value={`${view.is_system ? "system" : "personal"}:${view.id}`}>{view.is_system ? "Lista · " : "Mi vista · "}{view.name}</option>)}</select></label>
        <label><span>Buscar persona / alias / contacto</span><input value={builder.query} onChange={(event) => setBuilder((value) => ({ ...value, query: event.target.value }))} placeholder="Texto opcional" /></label>
        <label><span>Reserva real</span><select value={builder.reservation} onChange={(event) => setBuilder((value) => ({ ...value, reservation: event.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Con reserva</option><option value="no">Sin reserva</option></select></label>
        <label><span>Interés en clases</span><select value={builder.classInterest} onChange={(event) => setBuilder((value) => ({ ...value, classInterest: event.target.value as BuilderState["classInterest"] }))}><option value="all">Cualquiera</option><option value="interested">Sí</option><option value="not_interested">No</option><option value="unknown">No sabemos</option></select></label>
        <label><span>Próxima clase</span><select value={builder.nextClass} onChange={(event) => setBuilder((value) => ({ ...value, nextClass: event.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Cuestionario</span><select value={builder.questionnaire} onChange={(event) => setBuilder((value) => ({ ...value, questionnaire: event.target.value as BuilderState["questionnaire"] }))}><option value="all">Cualquiera</option><option value="finished">Finalizado</option><option value="pending">Pendiente con próxima clase</option></select></label>
        <label><span>Interés contenido online</span><select value={builder.onlineInterest} onChange={(event) => setBuilder((value) => ({ ...value, onlineInterest: event.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Interés formación profesores</span><select value={builder.teacherTrainingInterest} onChange={(event) => setBuilder((value) => ({ ...value, teacherTrainingInterest: event.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Edad mínima</span><input type="number" min="0" max="120" value={builder.minAge} onChange={(event) => setBuilder((value) => ({ ...value, minAge: event.target.value }))} /></label>
        <label><span>Edad máxima</span><input type="number" min="0" max="120" value={builder.maxAge} onChange={(event) => setBuilder((value) => ({ ...value, maxAge: event.target.value }))} /></label>
        <label><span>Localidad / país</span><input value={builder.location} onChange={(event) => setBuilder((value) => ({ ...value, location: event.target.value }))} placeholder="Málaga, FR…" /></label>
        <label><span>Motivo principal de no reserva</span><select value={builder.noBookingReason} onChange={(event) => setBuilder((value) => ({ ...value, noBookingReason: event.target.value }))}><option value="">Cualquiera</option>{Object.entries(reasonLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className={styles.builderDescription}><span>Descripción opcional</span><input value={builder.description} onChange={(event) => setBuilder((value) => ({ ...value, description: event.target.value }))} placeholder="Qué quieres controlar con este indicador" /></label>
      </div>

      <div className={styles.builderFooter}>
        <span><Filter /> {filterSummary(builderFilters)}</span>
        <div><button type="button" className={styles.secondaryButton} onClick={() => { setBuilder(emptyBuilder); setOpenBuilder(false); }}>Cancelar</button><button type="button" onClick={() => void savePanel()} disabled={saving}>{saving ? "Guardando…" : "Guardar panel"}</button></div>
      </div>
    </div> : null}

    {loading ? <div className={styles.loading}>Actualizando paneles CRM…</div> : null}
    {!loading && !panels.length ? <div className={styles.emptyDashboard}><UsersRound /><div><strong>Aún no tienes paneles personalizados.</strong><span>Crea el primero combinando filtros del CRM y elige qué valor quieres ver.</span></div></div> : null}

    {!loading && panels.length ? <div className={styles.dashboardGrid}>{panels.map((panel) => {
      const segment = rows.filter((row) => matchesFilters(row, panel.filters ?? {}));
      const value = metricValue(panel.metric_key, segment, rows);
      return <article className={styles.dashboardCard} key={panel.id}>
        <div className={styles.cardTop}><span>{metricLabel(panel.metric_key)}</span><button type="button" onClick={() => void deletePanel(panel.id)} aria-label={`Eliminar panel ${panel.title}`}><Trash2 /></button></div>
        <strong className={styles.cardValue}>{formatMetric(panel.metric_key, value)}</strong>
        <h3>{panel.title}</h3>
        <p>{panel.description || filterSummary(panel.filters ?? {})}</p>
        <small>{segment.length} personas en el segmento · datos vivos del CRM</small>
      </article>;
    })}</div> : null}
  </section>;
}
