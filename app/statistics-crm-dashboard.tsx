"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Filter, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./statistics-view.module.css";

type DanceProfile = {
  style_term_id?: number;
  style?: string;
  style_key?: string;
  role_mode?: string;
  role_term_id?: number;
  role?: string;
  role_key?: string;
  level_term_id?: number | null;
  level?: string | null;
  level_key?: string | null;
  self_reported_level_term_id?: number | null;
  self_reported_level?: string | null;
  is_primary?: boolean;
};

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
  cancelled_count: number;
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
  dance_experience: string | null;
  has_practice_partner: string | null;
  onboarding_reasons: string[];
  class_location_interest: string | null;
  temporary_until: string | null;
  plans_return: string | null;
  how_found_us: string | null;
  referred_by: string | null;
  declared_dance_profiles: DanceProfile[];
  primary_declared_style: string | null;
  primary_declared_style_key: string | null;
  primary_declared_role_mode: string | null;
  primary_self_reported_level: string | null;
  evaluated_dance_profiles: DanceProfile[];
  primary_evaluated_style: string | null;
  primary_evaluated_style_key: string | null;
  primary_evaluated_role: string | null;
  primary_evaluated_role_key: string | null;
  primary_evaluated_level: string | null;
  primary_evaluated_level_key: string | null;
};

type SavedView = {
  id: number;
  view_key: string | null;
  name: string;
  filters: Record<string, unknown>;
  is_system: boolean;
};

type MetricKey =
  | "people_count" | "percentage_total" | "average_age" | "reserved_count" | "reservation_rate"
  | "next_class_count" | "questionnaire_pending_count" | "registered_count" | "registered_rate"
  | "total_reservations" | "average_reservations" | "people_with_cancellations" | "total_cancellations";

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
  registered: TriState;
  classInterest: "all" | "interested" | "not_interested" | "unknown";
  nextClass: TriState;
  questionnaire: "all" | "finished" | "pending";
  onlineInterest: TriState;
  teacherTrainingInterest: TriState;
  minAge: string;
  maxAge: string;
  location: string;
  noBookingReason: string;
  howFoundUs: string;
  referredBy: string;
  danceExperience: string;
  practicePartner: string;
  onboardingReason: string;
  classLocationInterest: string;
  plansReturn: string;
  declaredStyle: string;
  declaredRole: string;
  selfReportedLevel: string;
  evaluatedStyle: string;
  evaluatedRole: string;
  evaluatedLevel: string;
};

const emptyBuilder: BuilderState = {
  title: "", description: "", metric: "people_count", baseView: "", query: "", reservation: "all", registered: "all",
  classInterest: "all", nextClass: "all", questionnaire: "all", onlineInterest: "all", teacherTrainingInterest: "all",
  minAge: "", maxAge: "", location: "", noBookingReason: "", howFoundUs: "", referredBy: "", danceExperience: "",
  practicePartner: "", onboardingReason: "", classLocationInterest: "", plansReturn: "", declaredStyle: "", declaredRole: "",
  selfReportedLevel: "", evaluatedStyle: "", evaluatedRole: "", evaluatedLevel: "",
};

const metrics: Array<{ key: MetricKey; label: string; help: string }> = [
  { key: "people_count", label: "Cantidad de personas", help: "Número de personas que cumplen todos los filtros." },
  { key: "percentage_total", label: "% del total de personas", help: "Qué porcentaje del CRM completo representa el segmento." },
  { key: "average_age", label: "Edad media", help: "Edad media de las personas filtradas que tienen fecha de nacimiento." },
  { key: "registered_count", label: "Personas registradas", help: "Personas del segmento que tienen una cuenta registrada." },
  { key: "registered_rate", label: "% de personas registradas", help: "Porcentaje del segmento que ya tiene cuenta registrada." },
  { key: "reserved_count", label: "Personas que han reservado", help: "Personas del segmento con al menos una reserva/clase real." },
  { key: "reservation_rate", label: "Tasa de reserva", help: "Porcentaje del segmento que ha reservado realmente." },
  { key: "total_reservations", label: "Reservas totales", help: "Suma de las reservas reales de todas las personas del segmento." },
  { key: "average_reservations", label: "Reservas medias por persona", help: "Media de reservas reales por persona dentro del segmento." },
  { key: "next_class_count", label: "Personas con próxima clase", help: "Personas del segmento que tienen una clase futura." },
  { key: "people_with_cancellations", label: "Personas con cancelaciones", help: "Personas del segmento que tienen al menos una clase cancelada." },
  { key: "total_cancellations", label: "Cancelaciones totales", help: "Suma de clases canceladas dentro del segmento." },
  { key: "questionnaire_pending_count", label: "Cuestionario pendiente + próxima clase", help: "Personas del segmento con próxima clase y cuestionario opcional pendiente." },
];

const reasonLabels: Record<string, string> = {
  price: "Precio", own_availability: "Disponibilidad del alumno", cya_availability: "Disponibilidad de CYA",
  incompatible_schedules: "Horarios incompatibles", location_distance: "Localidad / distancia", temporary_stay: "Estancia temporal",
  later: "Más adelante", thinking: "Lo está pensando", no_longer_interested: "Ya no tiene interés", no_response: "No responde", other: "Otro",
};

const howFoundLabels: Record<string, string> = {
  instagram: "Instagram", google: "Google", recommendation: "Recomendación", social_event: "Social o evento",
  student: "Otro alumno", festival: "Festival", other: "Otro",
};

const onboardingReasonLabels: Record<string, string> = {
  learn_zero: "Aprender desde cero", keep_improving: "Continuar aprendiendo / mejorar", specific_aspects: "Trabajar aspectos concretos",
  wedding: "Baile de boda", teacher_training: "Profesor · ampliar formación", online_content: "Contenido online",
  classes_cya: "Clases con Carlos & Andy", temporary_stay: "Estancia temporal", other: "Otro",
};

function rowSearch(row: PersonRow, needle: string) {
  const normalized = needle.trim().toLocaleLowerCase("es");
  if (!normalized) return true;
  return [row.display_name, row.internal_alias, row.email, row.phone, row.referred_by]
    .filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(normalized));
}

function includesText(value: string | null | undefined, expected: unknown) {
  const needle = String(expected ?? "").trim().toLocaleLowerCase("es");
  return !needle || String(value ?? "").toLocaleLowerCase("es").includes(needle);
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
    if (key === "location") return includesText(`${row.city ?? ""} ${row.country_code ?? ""}`, expected);
    if (key === "how_found_us") return row.how_found_us === expected;
    if (key === "referred_by") return includesText(row.referred_by, expected);
    if (key === "dance_experience") return row.dance_experience === expected;
    if (key === "has_practice_partner") return row.has_practice_partner === expected;
    if (key === "onboarding_reason") return (row.onboarding_reasons ?? []).includes(String(expected));
    if (key === "class_location_interest") return includesText(row.class_location_interest, expected);
    if (key === "plans_return") return row.plans_return === expected;
    if (key === "declared_style") return (row.declared_dance_profiles ?? []).some((profile) => profile.style_key === expected);
    if (key === "declared_role") return (row.declared_dance_profiles ?? []).some((profile) => profile.role_mode === expected);
    if (key === "self_reported_level") return (row.declared_dance_profiles ?? []).some((profile) => profile.self_reported_level === expected);
    if (key === "evaluated_style") return (row.evaluated_dance_profiles ?? []).some((profile) => profile.style_key === expected);
    if (key === "evaluated_role") return (row.evaluated_dance_profiles ?? []).some((profile) => profile.role_key === expected);
    if (key === "evaluated_level") return (row.evaluated_dance_profiles ?? []).some((profile) => profile.level_key === expected);
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
  if (metric === "registered_count") return segment.filter((row) => row.is_registered).length;
  if (metric === "registered_rate") return segment.length ? segment.filter((row) => row.is_registered).length * 100 / segment.length : null;
  if (metric === "reserved_count") return segment.filter((row) => row.has_reserved).length;
  if (metric === "reservation_rate") return segment.length ? segment.filter((row) => row.has_reserved).length * 100 / segment.length : null;
  if (metric === "total_reservations") return segment.reduce((sum, row) => sum + Number(row.reservation_count ?? 0), 0);
  if (metric === "average_reservations") return segment.length ? segment.reduce((sum, row) => sum + Number(row.reservation_count ?? 0), 0) / segment.length : null;
  if (metric === "next_class_count") return segment.filter((row) => row.has_next_class).length;
  if (metric === "people_with_cancellations") return segment.filter((row) => Number(row.cancelled_count ?? 0) > 0).length;
  if (metric === "total_cancellations") return segment.reduce((sum, row) => sum + Number(row.cancelled_count ?? 0), 0);
  if (metric === "questionnaire_pending_count") return segment.filter((row) => row.questionnaire_pending_with_next_class).length;
  return null;
}

function formatMetric(metric: MetricKey, value: number | null) {
  if (value === null) return "Sin datos";
  if (metric === "percentage_total" || metric === "reservation_rate" || metric === "registered_rate") return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} %`;
  if (metric === "average_age") return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value)} años`;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: metric === "average_reservations" ? 1 : 0 }).format(value);
}

function metricLabel(metric: MetricKey) { return metrics.find((item) => item.key === metric)?.label ?? metric; }

function filterSummary(filters: Record<string, unknown>) {
  const parts: string[] = [];
  if (filters.registered === true) parts.push("registrados");
  if (filters.registered === false) parts.push("sin registro");
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
  if (filters.how_found_us) parts.push(howFoundLabels[String(filters.how_found_us)] ?? String(filters.how_found_us));
  if (filters.referred_by) parts.push(`referido por ${String(filters.referred_by)}`);
  if (filters.onboarding_reason) parts.push(onboardingReasonLabels[String(filters.onboarding_reason)] ?? String(filters.onboarding_reason));
  if (filters.declared_style) parts.push(`declara ${String(filters.declared_style)}`);
  if (filters.declared_role) parts.push(String(filters.declared_role));
  if (filters.self_reported_level) parts.push(`nivel declarado ${String(filters.self_reported_level)}`);
  if (filters.evaluated_style) parts.push(`evaluado ${String(filters.evaluated_style)}`);
  if (filters.evaluated_role) parts.push(String(filters.evaluated_role));
  if (filters.evaluated_level) parts.push(`nivel evaluado ${String(filters.evaluated_level)}`);
  if (filters.primary_no_booking_reason) parts.push(reasonLabels[String(filters.primary_no_booking_reason)] ?? String(filters.primary_no_booking_reason));
  if (filters.query) parts.push(`“${String(filters.query)}”`);
  return parts.length ? parts.join(" · ") : "Todas las personas";
}

function uniqueOptions(rows: PersonRow[], source: "declaredStyle" | "selfLevel" | "evaluatedStyle" | "evaluatedLevel") {
  const values = new Map<string, string>();
  rows.forEach((row) => {
    const profiles = source === "declaredStyle" || source === "selfLevel" ? row.declared_dance_profiles ?? [] : row.evaluated_dance_profiles ?? [];
    profiles.forEach((profile) => {
      if (source === "declaredStyle" && profile.style_key && profile.style) values.set(profile.style_key, profile.style);
      if (source === "selfLevel" && profile.self_reported_level) values.set(profile.self_reported_level, profile.self_reported_level);
      if (source === "evaluatedStyle" && profile.style_key && profile.style) values.set(profile.style_key, profile.style);
      if (source === "evaluatedLevel" && profile.level_key && profile.level) values.set(profile.level_key, profile.level);
    });
  });
  return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
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
    setLoading(true); setError("");
    const [peopleResult, viewsResult, panelsResult] = await Promise.all([
      client.rpc("crm_person_explorer_snapshot"), client.rpc("crm_saved_views_snapshot"), client.rpc("crm_stat_panels_snapshot"),
    ]);
    const firstError = peopleResult.error ?? viewsResult.error ?? panelsResult.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }
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

  const declaredStyles = useMemo(() => uniqueOptions(rows, "declaredStyle"), [rows]);
  const selfLevels = useMemo(() => uniqueOptions(rows, "selfLevel"), [rows]);
  const evaluatedStyles = useMemo(() => uniqueOptions(rows, "evaluatedStyle"), [rows]);
  const evaluatedLevels = useMemo(() => uniqueOptions(rows, "evaluatedLevel"), [rows]);
  const selectedView = views.find((view) => `${view.is_system ? "system" : "personal"}:${view.id}` === builder.baseView) ?? null;

  const builderFilters = useMemo<Record<string, unknown>>(() => ({
    ...(selectedView?.filters ?? {}),
    ...(builder.query.trim() ? { query: builder.query.trim() } : {}),
    ...(builder.reservation !== "all" ? { reservation: builder.reservation } : {}),
    ...(builder.registered !== "all" ? { registered: builder.registered === "yes" } : {}),
    ...(builder.classInterest !== "all" ? { class_interest: builder.classInterest } : {}),
    ...(builder.nextClass !== "all" ? { has_next_class: builder.nextClass === "yes" } : {}),
    ...(builder.questionnaire === "finished" ? { questionnaire_finalized: true } : {}),
    ...(builder.questionnaire === "pending" ? { questionnaire_pending_with_next_class: true } : {}),
    ...(builder.onlineInterest !== "all" ? { interested_in_online_content: builder.onlineInterest === "yes" } : {}),
    ...(builder.teacherTrainingInterest !== "all" ? { interested_in_teacher_training: builder.teacherTrainingInterest === "yes" } : {}),
    ...(builder.minAge ? { min_age: Number(builder.minAge) } : {}), ...(builder.maxAge ? { max_age: Number(builder.maxAge) } : {}),
    ...(builder.location.trim() ? { location: builder.location.trim() } : {}),
    ...(builder.noBookingReason ? { primary_no_booking_reason: builder.noBookingReason } : {}),
    ...(builder.howFoundUs ? { how_found_us: builder.howFoundUs } : {}), ...(builder.referredBy.trim() ? { referred_by: builder.referredBy.trim() } : {}),
    ...(builder.danceExperience ? { dance_experience: builder.danceExperience } : {}), ...(builder.practicePartner ? { has_practice_partner: builder.practicePartner } : {}),
    ...(builder.onboardingReason ? { onboarding_reason: builder.onboardingReason } : {}),
    ...(builder.classLocationInterest.trim() ? { class_location_interest: builder.classLocationInterest.trim() } : {}),
    ...(builder.plansReturn ? { plans_return: builder.plansReturn } : {}), ...(builder.declaredStyle ? { declared_style: builder.declaredStyle } : {}),
    ...(builder.declaredRole ? { declared_role: builder.declaredRole } : {}), ...(builder.selfReportedLevel ? { self_reported_level: builder.selfReportedLevel } : {}),
    ...(builder.evaluatedStyle ? { evaluated_style: builder.evaluatedStyle } : {}), ...(builder.evaluatedRole ? { evaluated_role: builder.evaluatedRole } : {}),
    ...(builder.evaluatedLevel ? { evaluated_level: builder.evaluatedLevel } : {}),
  }), [builder, selectedView]);

  const previewRows = useMemo(() => rows.filter((row) => matchesFilters(row, builderFilters)), [builderFilters, rows]);
  const previewValue = useMemo(() => metricValue(builder.metric, previewRows, rows), [builder.metric, previewRows, rows]);

  async function savePanel() {
    const title = builder.title.trim() || metricLabel(builder.metric);
    setSaving(true); setError("");
    const result = await client.rpc("save_crm_stat_panel", {
      p_panel_id: null, p_title: title, p_description: builder.description.trim() || null, p_metric_key: builder.metric,
      p_filters: builderFilters, p_display_order: panels.length,
    });
    if (result.error) setError(result.error.message);
    else { notify("Panel de estadísticas guardado"); setBuilder(emptyBuilder); setOpenBuilder(false); await load(); }
    setSaving(false);
  }

  async function deletePanel(id: number) {
    setError("");
    const result = await client.rpc("delete_crm_stat_panel", { p_panel_id: id });
    if (result.error) setError(result.error.message); else { notify("Panel eliminado"); await load(); }
  }

  return <section className={styles.crmDashboard} aria-labelledby="crm-statistics-title">
    <div className={styles.dashboardHead}>
      <div><span className={styles.sectionEyebrow}>CRM + Estadísticas</span><h2 id="crm-statistics-title">Mis paneles de estadísticas</h2><p>Crea indicadores cruzando cualquier dato de personas, captación, reservas y nivel de baile. Los valores se recalculan automáticamente.</p></div>
      <div className={styles.dashboardActions}><button type="button" onClick={() => setOpenBuilder((value) => !value)} aria-expanded={openBuilder}><Plus /> Crear panel</button><button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Actualizar paneles"><RefreshCw /></button></div>
    </div>

    {error ? <div className={styles.dashboardError} role="alert">{error}</div> : null}

    {openBuilder ? <div className={styles.panelBuilder}>
      <div className={styles.builderHeading}><div><span>Nuevo panel</span><strong>Selecciona qué quieres medir y sobre qué personas.</strong></div><div className={styles.previewValue}><small>Vista previa</small><strong>{formatMetric(builder.metric, previewValue)}</strong><span>{previewRows.length} personas cumplen el filtro</span></div></div>
      <div className={styles.builderGrid}>
        <label><span>Título del panel</span><input value={builder.title} onChange={(e) => setBuilder((v) => ({ ...v, title: e.target.value }))} placeholder={metricLabel(builder.metric)} /></label>
        <label><span>Valor a mostrar</span><select value={builder.metric} onChange={(e) => setBuilder((v) => ({ ...v, metric: e.target.value as MetricKey }))}>{metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select><small>{metrics.find((m) => m.key === builder.metric)?.help}</small></label>
        <label><span>Partir de una lista CRM</span><select value={builder.baseView} onChange={(e) => setBuilder((v) => ({ ...v, baseView: e.target.value }))}><option value="">Todas las personas</option>{views.map((view) => <option key={view.id} value={`${view.is_system ? "system" : "personal"}:${view.id}`}>{view.is_system ? "Lista · " : "Mi vista · "}{view.name}</option>)}</select></label>
        <label><span>Buscar persona / alias / contacto</span><input value={builder.query} onChange={(e) => setBuilder((v) => ({ ...v, query: e.target.value }))} placeholder="Texto opcional" /></label>
        <label><span>Cuenta registrada</span><select value={builder.registered} onChange={(e) => setBuilder((v) => ({ ...v, registered: e.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Registrada</option><option value="no">Sin registrar</option></select></label>
        <label><span>Reserva real</span><select value={builder.reservation} onChange={(e) => setBuilder((v) => ({ ...v, reservation: e.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Con reserva</option><option value="no">Sin reserva</option></select></label>
        <label><span>Interés en clases</span><select value={builder.classInterest} onChange={(e) => setBuilder((v) => ({ ...v, classInterest: e.target.value as BuilderState["classInterest"] }))}><option value="all">Cualquiera</option><option value="interested">Sí</option><option value="not_interested">No</option><option value="unknown">No sabemos</option></select></label>
        <label><span>Próxima clase</span><select value={builder.nextClass} onChange={(e) => setBuilder((v) => ({ ...v, nextClass: e.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Cuestionario</span><select value={builder.questionnaire} onChange={(e) => setBuilder((v) => ({ ...v, questionnaire: e.target.value as BuilderState["questionnaire"] }))}><option value="all">Cualquiera</option><option value="finished">Finalizado</option><option value="pending">Pendiente con próxima clase</option></select></label>
        <label><span>Interés contenido online</span><select value={builder.onlineInterest} onChange={(e) => setBuilder((v) => ({ ...v, onlineInterest: e.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Interés formación profesores</span><select value={builder.teacherTrainingInterest} onChange={(e) => setBuilder((v) => ({ ...v, teacherTrainingInterest: e.target.value as TriState }))}><option value="all">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option></select></label>
        <label><span>Cómo nos conoció</span><select value={builder.howFoundUs} onChange={(e) => setBuilder((v) => ({ ...v, howFoundUs: e.target.value }))}><option value="">Cualquiera</option>{Object.entries(howFoundLabels).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Referido por</span><input value={builder.referredBy} onChange={(e) => setBuilder((v) => ({ ...v, referredBy: e.target.value }))} placeholder="Persona / texto" /></label>
        <label><span>Motivo declarado</span><select value={builder.onboardingReason} onChange={(e) => setBuilder((v) => ({ ...v, onboardingReason: e.target.value }))}><option value="">Cualquiera</option>{Object.entries(onboardingReasonLabels).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Experiencia al llegar</span><select value={builder.danceExperience} onChange={(e) => setBuilder((v) => ({ ...v, danceExperience: e.target.value }))}><option value="">Cualquiera</option><option value="start_zero">Empieza desde 0</option><option value="already_dance">Ya sabía bailar</option></select></label>
        <label><span>Tiene persona para practicar</span><select value={builder.practicePartner} onChange={(e) => setBuilder((v) => ({ ...v, practicePartner: e.target.value }))}><option value="">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option><option value="not_sure">No lo tiene claro</option></select></label>
        <label><span>Localidad donde quiere clase</span><input value={builder.classLocationInterest} onChange={(e) => setBuilder((v) => ({ ...v, classLocationInterest: e.target.value }))} placeholder="Cualquier localidad" /></label>
        <label><span>¿Tiene pensado volver?</span><select value={builder.plansReturn} onChange={(e) => setBuilder((v) => ({ ...v, plansReturn: e.target.value }))}><option value="">Cualquiera</option><option value="yes">Sí</option><option value="no">No</option><option value="dont_know">No lo sabe</option></select></label>
        <label><span>Estilo declarado</span><select value={builder.declaredStyle} onChange={(e) => setBuilder((v) => ({ ...v, declaredStyle: e.target.value }))}><option value="">Cualquiera</option>{declaredStyles.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Rol declarado</span><select value={builder.declaredRole} onChange={(e) => setBuilder((v) => ({ ...v, declaredRole: e.target.value }))}><option value="">Cualquiera</option><option value="leader">Leader</option><option value="follower">Follower</option><option value="role_rotation">Role Rotation / Ambos</option></select></label>
        <label><span>Nivel autodeclarado</span><select value={builder.selfReportedLevel} onChange={(e) => setBuilder((v) => ({ ...v, selfReportedLevel: e.target.value }))}><option value="">Cualquiera</option>{selfLevels.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Estilo evaluado</span><select value={builder.evaluatedStyle} onChange={(e) => setBuilder((v) => ({ ...v, evaluatedStyle: e.target.value }))}><option value="">Cualquiera</option>{evaluatedStyles.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Rol evaluado</span><select value={builder.evaluatedRole} onChange={(e) => setBuilder((v) => ({ ...v, evaluatedRole: e.target.value }))}><option value="">Cualquiera</option><option value="leader">Leader</option><option value="follower">Follower</option></select></label>
        <label><span>Nivel evaluado</span><select value={builder.evaluatedLevel} onChange={(e) => setBuilder((v) => ({ ...v, evaluatedLevel: e.target.value }))}><option value="">Cualquiera</option>{evaluatedLevels.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Edad mínima</span><input type="number" min="0" max="120" value={builder.minAge} onChange={(e) => setBuilder((v) => ({ ...v, minAge: e.target.value }))} /></label>
        <label><span>Edad máxima</span><input type="number" min="0" max="120" value={builder.maxAge} onChange={(e) => setBuilder((v) => ({ ...v, maxAge: e.target.value }))} /></label>
        <label><span>Localidad / país actual</span><input value={builder.location} onChange={(e) => setBuilder((v) => ({ ...v, location: e.target.value }))} placeholder="Málaga, FR…" /></label>
        <label><span>Motivo principal de no reserva</span><select value={builder.noBookingReason} onChange={(e) => setBuilder((v) => ({ ...v, noBookingReason: e.target.value }))}><option value="">Cualquiera</option>{Object.entries(reasonLabels).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className={styles.builderDescription}><span>Descripción opcional</span><input value={builder.description} onChange={(e) => setBuilder((v) => ({ ...v, description: e.target.value }))} placeholder="Qué quieres controlar con este indicador" /></label>
      </div>
      <div className={styles.builderFooter}><span><Filter /> {filterSummary(builderFilters)}</span><div><button type="button" className={styles.secondaryButton} onClick={() => { setBuilder(emptyBuilder); setOpenBuilder(false); }}>Cancelar</button><button type="button" onClick={() => void savePanel()} disabled={saving}>{saving ? "Guardando…" : "Guardar panel"}</button></div></div>
    </div> : null}

    {loading ? <div className={styles.loading}>Actualizando paneles CRM…</div> : null}
    {!loading && !panels.length ? <div className={styles.emptyDashboard}><UsersRound /><div><strong>Aún no tienes paneles personalizados.</strong><span>Crea el primero combinando filtros del CRM y elige qué valor quieres ver.</span></div></div> : null}
    {!loading && panels.length ? <div className={styles.dashboardGrid}>{panels.map((panel) => {
      const segment = rows.filter((row) => matchesFilters(row, panel.filters ?? {}));
      const value = metricValue(panel.metric_key, segment, rows);
      return <article className={styles.dashboardCard} key={panel.id}><div className={styles.cardTop}><span>{metricLabel(panel.metric_key)}</span><button type="button" onClick={() => void deletePanel(panel.id)} aria-label={`Eliminar panel ${panel.title}`}><Trash2 /></button></div><strong className={styles.cardValue}>{formatMetric(panel.metric_key, value)}</strong><h3>{panel.title}</h3><p>{panel.description || filterSummary(panel.filters ?? {})}</p><small>{segment.length} personas en el segmento · datos vivos del CRM</small></article>;
    })}</div> : null}
  </section>;
}
