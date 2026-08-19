"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Filter, RefreshCw, Search, UsersRound } from "lucide-react";
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

function matchesView(row: PersonRow, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, expected]) => {
    if (key === "registered") return row.is_registered === Boolean(expected);
    if (key === "interest_classified") return (Object.keys(row.interest_states ?? {}).length > 0) === Boolean(expected);
    if (key === "interested_in_person_classes") return row.interested_in_person_classes === Boolean(expected);
    if (key === "has_reserved") return row.has_reserved === Boolean(expected);
    if (key === "no_booking_reason_missing") return row.no_booking_reason_missing === Boolean(expected);
    if (key === "primary_no_booking_reason") return row.primary_no_booking_reason === expected;
    return true;
  });
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function CrmPersonExplorer({ db, refreshToken, notify }: Props) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<string>("interested_no_booking");
  const [query, setQuery] = useState("");
  const [reservation, setReservation] = useState<"all" | "yes" | "no">("all");
  const [interest, setInterest] = useState<"all" | "yes" | "no" | "unknown">("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [location, setLocation] = useState("");
  const [busyPerson, setBusyPerson] = useState<number | null>(null);
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
    setRows((peopleResult.data ?? []) as PersonRow[]);
    setViews((viewsResult.data ?? []) as SavedView[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [db, refreshToken]);

  const selectedView = views.find((view) => view.view_key === activeView) ?? null;

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    const place = location.trim().toLocaleLowerCase("es");
    const minimum = minAge ? Number(minAge) : null;
    const maximum = maxAge ? Number(maxAge) : null;
    return rows.filter((row) => {
      if (selectedView && !matchesView(row, selectedView.filters ?? {})) return false;
      if (needle && ![row.display_name, row.internal_alias, row.email, row.phone].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(needle))) return false;
      if (reservation === "yes" && !row.has_reserved) return false;
      if (reservation === "no" && row.has_reserved) return false;
      const classState = row.interest_states?.in_person_classes ?? "unknown";
      if (interest === "yes" && classState !== "interested") return false;
      if (interest === "no" && classState !== "not_interested") return false;
      if (interest === "unknown" && classState !== "unknown") return false;
      if (minimum !== null && (row.age === null || row.age < minimum)) return false;
      if (maximum !== null && (row.age === null || row.age > maximum)) return false;
      if (place && !`${row.city ?? ""} ${row.country_code ?? ""}`.toLocaleLowerCase("es").includes(place)) return false;
      return true;
    });
  }, [activeView, interest, location, maxAge, minAge, query, reservation, rows, selectedView]);

  const counts = useMemo(() => new Map(views.map((view) => [view.view_key, rows.filter((row) => matchesView(row, view.filters ?? {})).length])), [rows, views]);

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

  return <section className={styles.shell} aria-labelledby="crm-explorer-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>CRM transversal</span><h2 id="crm-explorer-title"><UsersRound /> Personas y datos</h2><p>Listas vivas construidas desde los datos reales de CYA. Reservas, edades e históricos se derivan de sus fuentes de verdad.</p></div>
      <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading} aria-label="Actualizar CRM"><RefreshCw className={loading ? styles.spin : ""} /></button>
    </header>

    {error ? <p className={styles.error} role="alert">{error}</p> : null}

    <div className={styles.views} aria-label="Listas CRM">
      <button type="button" className={!activeView ? styles.activeView : ""} onClick={() => setActiveView("")}>Todas <strong>{rows.length}</strong></button>
      {views.filter((view) => view.is_system).map((view) => <button type="button" key={view.id} className={activeView === view.view_key ? styles.activeView : ""} onClick={() => setActiveView(view.view_key ?? "")}><span>{view.name}</span><strong>{counts.get(view.view_key) ?? 0}</strong></button>)}
    </div>

    <div className={styles.filters}>
      <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, alias, email o teléfono" /></label>
      <label><span>Reserva</span><select value={reservation} onChange={(event) => setReservation(event.target.value as typeof reservation)}><option value="all">Todas</option><option value="yes">Con reserva real</option><option value="no">Sin reserva real</option></select></label>
      <label><span>Interés en clases</span><select value={interest} onChange={(event) => setInterest(event.target.value as typeof interest)}><option value="all">Todos</option><option value="yes">Sí</option><option value="no">No</option><option value="unknown">No sabemos</option></select></label>
      <label><span>Edad mín.</span><input type="number" min="0" max="120" value={minAge} onChange={(event) => setMinAge(event.target.value)} /></label>
      <label><span>Edad máx.</span><input type="number" min="0" max="120" value={maxAge} onChange={(event) => setMaxAge(event.target.value)} /></label>
      <label><span>Localidad / país</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Málaga, FR…" /></label>
    </div>

    <div className={styles.resultHeader}><span><Filter /> {visibleRows.length} persona{visibleRows.length === 1 ? "" : "s"}</span>{selectedView ? <strong>{selectedView.name}</strong> : <strong>Vista completa</strong>}</div>

    <div className={styles.list}>
      {loading ? <div className={styles.empty}>Actualizando datos…</div> : null}
      {!loading && !visibleRows.length ? <div className={styles.empty}>No hay personas que cumplan estos filtros.</div> : null}
      {visibleRows.map((row) => {
        const classInterest = row.interest_states?.in_person_classes ?? "unknown";
        return <article className={styles.row} key={row.person_id}>
          <div className={styles.identity}><strong>{row.display_name}</strong>{row.internal_alias ? <small>Alias: {row.internal_alias}</small> : null}<span>{[row.city, row.country_code, row.age !== null ? `${row.age} años` : null].filter(Boolean).join(" · ") || "Sin datos demográficos"}</span></div>
          <div className={styles.fact}><span>Reserva real</span><strong className={row.has_reserved ? styles.positive : ""}>{row.has_reserved ? `Sí · ${row.reservation_count}` : "No"}</strong><small>{row.next_class_at ? `Próxima ${dateLabel(row.next_class_at)}` : row.last_class_at ? `Última ${dateLabel(row.last_class_at)}` : "Sin clases"}</small></div>
          <label className={styles.action}><span>Interés clases</span><select disabled={busyPerson === row.person_id} value={classInterest} onChange={(event) => void setClassInterest(row.person_id, event.target.value as "unknown" | "interested" | "not_interested")}><option value="unknown">No sabemos</option><option value="interested">Sí</option><option value="not_interested">No</option></select></label>
          <label className={styles.action}><span>Motivo sin reserva</span><select disabled={busyPerson === row.person_id || row.has_reserved || classInterest !== "interested"} value={row.primary_no_booking_reason ?? ""} onChange={(event) => void setReason(row.person_id, event.target.value)}><option value="">{row.has_reserved ? "Ya reservó" : classInterest !== "interested" ? "No aplica" : "Seleccionar…"}</option>{Object.entries(reasonLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </article>;
      })}
    </div>
  </section>;
}
