"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Megaphone,
  Plus,
  RefreshCw,
  Target,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CyaIcon } from "./cya-icon";
import type { CalendarItem, CalendarSnapshot } from "./v14-types";
import { GoogleCalendarSync } from "./google-calendar-sync";

type CalendarMode = "day" | "week" | "month" | "list";
type CalendarType = CalendarItem["type"];

type AgendaViewProps = {
  client: SupabaseClient;
  timezone: string;
  schedule: () => void;
  openClass: (id: number) => void;
  notify: (message: string) => void;
};

const emptySnapshot: CalendarSnapshot = { classes: [], missions: [], marketing_events: [], external_events: [] };

function localKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function keyParts(key: string) { const [year, month, day] = key.split("-").map(Number); return { year, month, day }; }
function addDays(key: string, amount: number) { const { year, month, day } = keyParts(key); const date = new Date(Date.UTC(year, month - 1, day + amount)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function monthStart(key: string) { const { year, month } = keyParts(key); return `${year}-${String(month).padStart(2, "0")}-01`; }
function nextMonth(key: string) { const { year, month } = keyParts(key); const date = new Date(Date.UTC(year, month, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function weekday(key: string) { const { year, month, day } = keyParts(key); const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); return value === 0 ? 7 : value; }
function startOfWeek(key: string) { return addDays(key, 1 - weekday(key)); }
function zonedStart(key: string, timezone: string) {
  const { year, month, day } = keyParts(key); const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second); return new Date(guess - (represented - guess));
}
function rangeFor(mode: CalendarMode, key: string, timezone: string) {
  let fromKey = key; let toKey = addDays(key, 1);
  if (mode === "week") { fromKey = startOfWeek(key); toKey = addDays(fromKey, 7); }
  else if (mode === "month") { fromKey = monthStart(key); toKey = nextMonth(fromKey); }
  else if (mode === "list") toKey = addDays(key, 31);
  return { from: zonedStart(fromKey, timezone), to: zonedStart(toKey, timezone), fromKey, toKey };
}
function modeTitle(mode: CalendarMode, key: string, timezone: string) {
  const date = zonedStart(key, timezone);
  if (mode === "day") return new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(date);
  if (mode === "month") return new Intl.DateTimeFormat("es-ES", { timeZone: timezone, month: "long", year: "numeric" }).format(date);
  if (mode === "list") return "Próximos 31 días";
  const start = startOfWeek(key); return `${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short" }).format(zonedStart(start, timezone))} — ${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short" }).format(zonedStart(addDays(start, 6), timezone))}`;
}
function itemVisual(type: CalendarType) {
  if (type === "mission") return { iconKey: "management.missions", fallback: Target };
  if (type === "event") return { iconKey: "marketing.events", fallback: Megaphone };
  if (type === "external") return { iconKey: "navigation.calendar", fallback: RefreshCw };
  return { iconKey: "management.classes", fallback: CalendarDays };
}
function itemLabel(type: CalendarType) { return ({ class: "Clase", mission: "Misión", event: "Evento", external: "Calendario" } as Record<CalendarType, string>)[type]; }

export function AgendaView({ client, timezone, schedule, openClass, notify }: AgendaViewProps) {
  const [mode, setMode] = useState<CalendarMode>("week"); const [key, setKey] = useState(() => localKey(new Date(), timezone));
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>(emptySnapshot); const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<CalendarType, boolean>>({ class: true, mission: true, event: true, external: true });
  const range = useMemo(() => rangeFor(mode, key, timezone), [mode, key, timezone]);
  const load = useCallback(async () => { setLoading(true); const result = await client.rpc("calendar_snapshot", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }); if (result.error) notify(result.error.message); else setSnapshot(result.data as CalendarSnapshot); setLoading(false); }, [client, notify, range.from, range.to]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const items = useMemo(() => [...(snapshot.classes ?? []), ...(snapshot.missions ?? []), ...(snapshot.marketing_events ?? []), ...(snapshot.external_events ?? [])].filter((item) => filters[item.type]).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [snapshot, filters]);
  function move(direction: number) { if (mode === "day") setKey(addDays(key, direction)); else if (mode === "week") setKey(addDays(key, direction * 7)); else if (mode === "list") setKey(addDays(key, direction * 31)); else { const { year, month } = keyParts(key); const date = new Date(Date.UTC(year, month - 1 + direction, 1)); setKey(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`); } }
  function renderItem(item: CalendarItem) { const visual = itemVisual(item.type); return <button className={`calendar-item type-${item.type}`} key={`${item.type}-${item.id}`} onClick={() => item.type === "class" && openClass(item.id)}><span className="calendar-item-icon"><CyaIcon iconKey={visual.iconKey} fallback={visual.fallback} /></span><span><small>{itemLabel(item.type)}</small><strong>{item.title}</strong><time>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at))}–{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.ends_at))}</time></span>{item.type === "class" ? <CyaIcon iconKey="action.forward" fallback={ChevronRight} /> : <CyaIcon iconKey="state.success" fallback={CircleCheck} />}</button>; }
  const groups = new Map<string, CalendarItem[]>(); items.forEach((item) => { const itemKey = localKey(new Date(item.starts_at), timezone); groups.set(itemKey, [...(groups.get(itemKey) ?? []), item]); });
  const monthFirst = monthStart(key); const monthGridStart = addDays(monthFirst, 1 - weekday(monthFirst)); const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  return <>
    <header className="page-head agenda-head"><div><p className="eyebrow">Agenda</p><h1>Calendario CYA</h1><p>Clases, misiones, eventos y calendario sincronizado sin duplicar la información pedagógica.</p></div><button className="btn" onClick={schedule}><CyaIcon iconKey="action.add" fallback={Plus} /> Programar clase</button></header>
    <GoogleCalendarSync client={client} notify={notify} onSynced={load} compact />
    <section className="calendar-toolbar card"><div className="calendar-nav"><button className="icon-btn" onClick={() => move(-1)} aria-label="Anterior"><CyaIcon iconKey="action.back" fallback={ChevronLeft} /></button><button className="today-button" onClick={() => setKey(localKey(new Date(), timezone))}>Hoy</button><button className="icon-btn" onClick={() => move(1)} aria-label="Siguiente"><CyaIcon iconKey="action.forward" fallback={ChevronRight} /></button><strong>{modeTitle(mode, key, timezone)}</strong></div><div className="calendar-modes">{(["day", "week", "month", "list"] as CalendarMode[]).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "day" ? "Día" : value === "week" ? "Semana" : value === "month" ? "Mes" : "Lista"}</button>)}</div></section>
    <div className="calendar-filters" aria-label="Filtros de agenda">{(["class", "mission", "event", "external"] as CalendarType[]).map((type) => <button key={type} className={filters[type] ? `active type-${type}` : ""} onClick={() => setFilters((current) => ({ ...current, [type]: !current[type] }))}>{itemLabel(type)}</button>)}</div>
    {mode === "month" ? <section className="month-calendar card"><div className="month-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => <span key={label}>{label}</span>)}</div><div className="month-days">{monthDays.map((dayKey) => { const dayItems = groups.get(dayKey) ?? []; const inMonth = dayKey.slice(0, 7) === monthFirst.slice(0, 7); return <button key={dayKey} className={`${dayKey === localKey(new Date(), timezone) ? "today" : ""} ${inMonth ? "" : "outside"}`} onClick={() => { setKey(dayKey); setMode("day"); }}><strong>{Number(dayKey.slice(-2))}</strong><span>{dayItems.slice(0, 4).map((item) => <i key={`${item.type}-${item.id}`} className={`type-${item.type}`} />)}</span>{dayItems.length ? <small>{dayItems.length}</small> : null}</button>; })}</div></section> : <section className="calendar-groups">{Array.from(groups.entries()).map(([dayKey, dayItems]) => <article className="calendar-day" key={dayKey}><header><span>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "short" }).format(zonedStart(dayKey, timezone))}</span><strong>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "long" }).format(zonedStart(dayKey, timezone))}</strong></header><div>{dayItems.map(renderItem)}</div></article>)}{!items.length ? <div className="empty"><CyaIcon iconKey="navigation.calendar" fallback={CalendarDays} /><strong>{loading ? "Actualizando agenda…" : "No hay nada en este periodo"}</strong><p>Los filtros activos no contienen clases, misiones ni eventos.</p></div> : null}</section>}
  </>;
}
