"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BookmarkPlus, Filter, RefreshCw, Search, Settings2, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./crm-person-explorer.module.css";

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
  columns: string[];
  sort: Array<{ field?: string; direction?: "asc" | "desc" }>;
  is_system: boolean;
};

type Props = { db: SupabaseClient; refreshToken?: unknown; notify?: (message: string) => void };

type ColumnKey =
  | "display_name" | "internal_alias" | "phone" | "email" | "location" | "age"
  | "reservation" | "next_class" | "last_class" | "interest" | "online_content"
  | "teacher_training" | "questionnaire" | "no_booking_reason";

const defaultColumns: ColumnKey[] = ["display_name", "phone", "reservation", "interest", "no_booking_reason"];

const columnCatalog: Array<{ key: ColumnKey; label: string; group: string }> = [
  { key: "display_name", label: "Nombre", group: "Identidad" },
  { key: "internal_alias", label: "Alias interno", group: "Identidad" },
  { key: "phone", label: "Teléfono", group: "Contacto" },
  { key: "email", label: "Email", group: "Contacto" },
  { key: "location", label: "Localidad / país", group: "Datos personales" },
  { key: "age", label: "Edad", group: "Datos personales" },
  { key: "reservation", label: "Reserva real", group: "Clases" },
  { key: "next_class", label: "Próxima clase", group: "Clases" },
  { key: "last_class", label: "Última clase", group: "Clases" },
  { key: "interest", label: "Interés en clases", group: "CRM" },
  { key: "online_content", label: "Interés contenido online", group: "CRM" },
  { key: "teacher_training", label: "Interés formación profesores", group: "CRM" },
  { key: "questionnaire", label: "Cuestionario opcional", group: "Seguimiento" },
  { key: "no_booking_reason", label: "Motivo de no reserva", group: "CRM" },
];

const validColumnKeys = new Set<ColumnKey>(columnCatalog.map((column) => column.key));

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

function normalizeColumns(columns: string[] | null | undefined): ColumnKey[] {
  const result = (columns ?? []).filter((key): key is ColumnKey => validColumnKeys.has(key as ColumnKey));
  return result.length ? Array.from(new Set(result)) : defaultColumns;
}

function rowSearch(row: PersonRow, needle: string) {
  const normalized = needle.trim().toLocaleLowerCase("es");
  if (!normalized) return true;
  return [row.display_name, row.internal_alias, row.email, row.phone]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("es").includes(normalized));
}

function matchesView(row: PersonRow, filters: Record<string, unknown>) {
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

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function viewToken(view: SavedView) {
  return view.is_system ? `system:${view.view_key}` : `personal:${view.id}`;
}

export function CrmPersonExplorer({ db, refreshToken, notify }: Props) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<string>("system:interested_no_booking");
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [query, setQuery] = useState("");
  const [reservation, setReservation] = useState<"all" | "yes" | "no">("all");
  const [interest, setInterest] = useState<"all" | "interested" | "not_interested" | "unknown">("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [location, setLocation] = useState("");
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [busyPerson, setBusyPerson] = useState<number | null>(null);
  const [busyView, setBusyView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const [peopleResult, viewsResult] = await Promise.all([
      db.rpc("crm_person_explorer_snapshot"),
      db.rpc("crm_saved_views_snapshot"),
    ]);
    if (peopleResult.error || viewsResult.error) {
      setError((peopleResult.error ?? viewsResult.error)?.message ?? "No se ha podido cargar el CRM.");
      setLoading(false);
      return;
    }
    const nextViews = (viewsResult.data ?? []) as SavedView[];
    setRows((peopleResult.data ?? []) as PersonRow[]);
    setViews(nextViews);
    const current = nextViews.find((view) => viewToken(view) === activeView);
    if (current) setVisibleColumns(normalizeColumns(current.columns));
    setLoading(false);
  }

  useEffect(() => { void load(); }, [db, refreshToken]);

  const selectedView = views.find((view) => viewToken(view) === activeView) ?? null;

  function resetManualFilters() {
    setQuery(""); setReservation("all"); setInterest("all"); setMinAge(""); setMaxAge(""); setLocation("");
  }

  function activateView(token: string) {
    setActiveView(token);
    resetManualFilters();
    const view = views.find((candidate) => viewToken(candidate) === token);
    setVisibleColumns(view ? normalizeColumns(view.columns) : defaultColumns);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((current) => {
      if (key === "display_name" && current.includes(key)) return current;
      if (current.includes(key)) {
        const next = current.filter((column) => column !== key);
        return next.length ? next : ["display_name"];
      }
      const next = [...current, key];
      return columnCatalog.filter((column) => next.includes(column.key)).map((column) => column.key);
    });
  }

  const manualFilters = useMemo<Record<string, unknown>>(() => ({
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(reservation !== "all" ? { reservation } : {}),
    ...(interest !== "all" ? { class_interest: interest } : {}),
    ...(minAge ? { min_age: Number(minAge) } : {}),
    ...(maxAge ? { max_age: Number(maxAge) } : {}),
    ...(location.trim() ? { location: location.trim() } : {}),
  }), [interest, location, maxAge, minAge, query, reservation]);

  const effectiveFilters = useMemo(() => ({ ...(selectedView?.filters ?? {}), ...manualFilters }), [manualFilters, selectedView]);
  const visibleRows = useMemo(() => rows.filter((row) => matchesView(row, effectiveFilters)), [effectiveFilters, rows]);
  const counts = useMemo(() => new Map(views.map((view) => [viewToken(view), rows.filter((row) => matchesView(row, view.filters ?? {})).length])), [rows, views]);

  async function saveCurrentView() {
    const name = saveName.trim();
    if (!name) return;
    setBusyView(true); setError("");
    const result = await db.rpc("save_crm_saved_view", {
      p_view_id: null,
      p_name: name,
      p_filters: effectiveFilters,
      p_columns: visibleColumns,
      p_sort: [{ field: "display_name", direction: "asc" }],
    });
    if (result.error) setError(result.error.message);
    else {
      notify?.("Vista CRM guardada");
      setSaveName(""); setShowSave(false);
      await load();
    }
    setBusyView(false);
  }

  async function deleteView(view: SavedView) {
    if (view.is_system) return;
    setBusyView(true); setError("");
    const result = await db.rpc("delete_crm_saved_view", { p_view_id: view.id });
    if (result.error) setError(result.error.message);
    else {
      if (activeView === viewToken(view)) activateView("");
      notify?.("Vista CRM eliminada");
      await load();
    }
    setBusyView(false);
  }

  async function setClassInterest(personId: number, status: "unknown" | "interested" | "not_interested") {
    setBusyPerson(personId);
    const result = await db.rpc("set_crm_interest_state", { p_person_id: personId, p_interest_type: "in_person_classes", p_status: status, p_note: null });
    if (result.error) setError(result.error.message);
    else { notify?.("Interés actualizado"); await load(); }
    setBusyPerson(null);
  }

  async function setReason(personId: number, reason: string) {
    if (!reason) return;
    setBusyPerson(personId);
    const result = await db.rpc("set_crm_no_booking_reason", { p_person_id: personId, p_reason_key: reason, p_active: true, p_is_primary: true, p_note: null, p_source_type: "manual", p_source_class_id: null });
    if (result.error) setError(result.error.message);
    else { notify?.("Motivo de no reserva actualizado"); await load(); }
    setBusyPerson(null);
  }

  function renderValue(row: PersonRow, key: ColumnKey) {
    const classInterest = row.interest_states?.in_person_classes ?? "unknown";
    if (key === "display_name") return <div className={styles.identity}><strong>{row.display_name}</strong></div>;
    if (key === "internal_alias") return row.internal_alias || "—";
    if (key === "phone") return row.phone || "—";
    if (key === "email") return row.email || "—";
    if (key === "location") return [row.city, row.country_code].filter(Boolean).join(" · ") || "—";
    if (key === "age") return row.age === null ? "—" : `${row.age} años`;
    if (key === "reservation") return <span className={row.has_reserved ? styles.positive : ""}>{row.has_reserved ? `Sí · ${row.reservation_count}` : "No"}</span>;
    if (key === "next_class") return dateLabel(row.next_class_at);
    if (key === "last_class") return dateLabel(row.last_class_at);
    if (key === "online_content") return row.interested_in_online_content ? "Sí" : "No / sin clasificar";
    if (key === "teacher_training") return row.interested_in_teacher_training ? "Sí" : "No / sin clasificar";
    if (key === "questionnaire") return row.questionnaire_finalized ? "Finalizado" : row.questionnaire_pending_with_next_class ? "Pendiente · próxima clase" : "Pendiente";
    if (key === "interest") return <select className={styles.inlineSelect} disabled={busyPerson === row.person_id} value={classInterest} onChange={(event) => void setClassInterest(row.person_id, event.target.value as "unknown" | "interested" | "not_interested")}><option value="unknown">No sabemos</option><option value="interested">Sí</option><option value="not_interested">No</option></select>;
    if (key === "no_booking_reason") return <select className={styles.inlineSelect} disabled={busyPerson === row.person_id || row.has_reserved || classInterest !== "interested"} value={row.primary_no_booking_reason ?? ""} onChange={(event) => void setReason(row.person_id, event.target.value)}><option value="">{row.has_reserved ? "Ya reservó" : classInterest !== "interested" ? "No aplica" : "Seleccionar…"}</option>{Object.entries(reasonLabels).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}</select>;
    return "—";
  }

  const systemViews = views.filter((view) => view.is_system);
  const personalViews = views.filter((view) => !view.is_system);

  return <section className={styles.shell} aria-labelledby="crm-explorer-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>CRM transversal</span><h2 id="crm-explorer-title"><UsersRound /> Personas y datos</h2><p>Elige qué datos quieres ver y guarda la combinación como una lista viva. Los hechos reales se recalculan desde sus fuentes de verdad.</p></div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.columnsButton} onClick={() => setShowColumns((value) => !value)} aria-expanded={showColumns}><Settings2 /> <span>Parámetros</span></button>
        <button type="button" className={styles.saveButton} onClick={() => setShowSave((value) => !value)} aria-expanded={showSave}><BookmarkPlus /> <span>Guardar vista</span></button>
        <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading} aria-label="Actualizar CRM"><RefreshCw className={loading ? styles.spin : ""} /></button>
      </div>
    </header>

    {showColumns ? <div className={styles.columnPicker}>
      <div><strong>Parámetros visibles</strong><span>{visibleColumns.length} seleccionados</span></div>
      <div className={styles.columnOptions}>{columnCatalog.map((column) => <label key={column.key}><input type="checkbox" checked={visibleColumns.includes(column.key)} disabled={column.key === "display_name"} onChange={() => toggleColumn(column.key)} /><span><strong>{column.label}</strong><small>{column.group}</small></span></label>)}</div>
    </div> : null}

    {showSave ? <div className={styles.saveBar}>
      <label><span>Nombre de la vista</span><input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Ej. Mayores de 30 sin reserva" /></label>
      <button type="button" onClick={() => void saveCurrentView()} disabled={busyView || !saveName.trim()}>Guardar filtros + parámetros</button>
    </div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}

    <div className={styles.views} aria-label="Listas CRM">
      <button type="button" className={!activeView ? styles.activeView : ""} onClick={() => activateView("")}>Todas <strong>{rows.length}</strong></button>
      {systemViews.map((view) => <button type="button" key={view.id} className={activeView === viewToken(view) ? styles.activeView : ""} onClick={() => activateView(viewToken(view))}><span>{view.name}</span><strong>{counts.get(viewToken(view)) ?? 0}</strong></button>)}
    </div>

    {personalViews.length ? <div className={styles.personalViews} aria-label="Mis vistas CRM"><span>Mis vistas</span><div>{personalViews.map((view) => <span className={styles.personalView} key={view.id}><button type="button" className={activeView === viewToken(view) ? styles.activeView : ""} onClick={() => activateView(viewToken(view))}>{view.name} <strong>{counts.get(viewToken(view)) ?? 0}</strong></button><button type="button" className={styles.deleteView} onClick={() => void deleteView(view)} disabled={busyView} aria-label={`Eliminar vista ${view.name}`}><Trash2 /></button></span>)}</div></div> : null}

    <div className={styles.filters}>
      <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, alias, email o teléfono" /></label>
      <label><span>Reserva</span><select value={reservation} onChange={(event) => setReservation(event.target.value as typeof reservation)}><option value="all">Todas</option><option value="yes">Con reserva real</option><option value="no">Sin reserva real</option></select></label>
      <label><span>Interés en clases</span><select value={interest} onChange={(event) => setInterest(event.target.value as typeof interest)}><option value="all">Todos</option><option value="interested">Sí</option><option value="not_interested">No</option><option value="unknown">No sabemos</option></select></label>
      <label><span>Edad mín.</span><input type="number" min="0" max="120" value={minAge} onChange={(event) => setMinAge(event.target.value)} /></label>
      <label><span>Edad máx.</span><input type="number" min="0" max="120" value={maxAge} onChange={(event) => setMaxAge(event.target.value)} /></label>
      <label><span>Localidad / país</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Málaga, FR…" /></label>
    </div>

    <div className={styles.resultHeader}><span><Filter /> {visibleRows.length} persona{visibleRows.length === 1 ? "" : "s"}</span>{selectedView ? <strong>{selectedView.name}</strong> : <strong>Vista completa</strong>}</div>

    <div className={styles.dataTable} style={{ "--crm-columns": visibleColumns.length } as React.CSSProperties}>
      <div className={styles.tableHeader}>{visibleColumns.map((key) => <span key={key}>{columnCatalog.find((column) => column.key === key)?.label ?? key}</span>)}</div>
      {loading ? <div className={styles.empty}>Actualizando datos…</div> : null}
      {!loading && !visibleRows.length ? <div className={styles.empty}>No hay personas que cumplan estos filtros.</div> : null}
      {!loading && visibleRows.map((row) => <article className={styles.dataRow} key={row.person_id}>{visibleColumns.map((key) => <div className={styles.dataCell} key={key} data-label={columnCatalog.find((column) => column.key === key)?.label ?? key}>{renderValue(row, key)}</div>)}</article>)}
    </div>
  </section>;
}
