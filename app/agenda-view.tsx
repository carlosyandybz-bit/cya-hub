"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Megaphone,
  MessageCircle,
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
type VisualRow = { external_calendar_id: string; calendar_name: string; icon_storage_path: string | null; color_override: string | null };
type PendingParticipant = {
  person_id: number;
  display_name: string;
  phone: string | null;
  country_code: string | null;
  confirmation_status: string;
};
type PendingConfirmationClass = {
  class_id: number;
  scheduled_start_at: string;
  duration_minutes: number;
  class_type: string;
  location_text: string | null;
  confirmation_opens_at: string;
  pending_participants: PendingParticipant[];
};

type AgendaViewProps = {
  client: SupabaseClient;
  timezone: string;
  schedule: () => void;
  openClass: (id: number) => void;
  notify: (message: string) => void;
};

const emptySnapshot: CalendarSnapshot = { classes: [], missions: [], marketing_events: [], external_events: [] };
const GOOGLE_PALETTE = ["#7986CB", "#33B679", "#8E24AA", "#E67C73", "#F6BF26", "#F4511E", "#039BE5", "#616161", "#3F51B5", "#0B8043", "#D50000"];
const COUNTRY_DIAL_CODES: Record<string, string> = {
  ES: "34", PT: "351", FR: "33", IT: "39", DE: "49", GB: "44", IE: "353", NL: "31", BE: "32", CH: "41", AT: "43",
  US: "1", CA: "1", MX: "52", AR: "54", CO: "57", CL: "56", PE: "51", BR: "55", VE: "58", DO: "1", PR: "1",
};

function localKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function keyParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function addDays(key: string, amount: number) {
  const { year, month, day } = keyParts(key);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthStart(key: string) {
  const { year, month } = keyParts(key);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function nextMonth(key: string) {
  const { year, month } = keyParts(key);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function weekday(key: string) {
  const { year, month, day } = keyParts(key);
  const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return value === 0 ? 7 : value;
}

function startOfWeek(key: string) {
  return addDays(key, 1 - weekday(key));
}

function zonedStart(key: string, timezone: string) {
  const { year, month, day } = keyParts(key);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return new Date(guess - (represented - guess));
}

function rangeFor(mode: CalendarMode, key: string, timezone: string) {
  let fromKey = key;
  let toKey = addDays(key, 1);
  if (mode === "week") {
    fromKey = startOfWeek(key);
    toKey = addDays(fromKey, 7);
  } else if (mode === "month") {
    fromKey = monthStart(key);
    toKey = nextMonth(fromKey);
  } else if (mode === "list") {
    toKey = addDays(key, 31);
  }
  return { from: zonedStart(fromKey, timezone), to: zonedStart(toKey, timezone), fromKey, toKey };
}

function modeTitle(mode: CalendarMode, key: string, timezone: string) {
  const date = zonedStart(key, timezone);
  if (mode === "day") return new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(date);
  if (mode === "month") return new Intl.DateTimeFormat("es-ES", { timeZone: timezone, month: "long", year: "numeric" }).format(date);
  if (mode === "list") return "Próximos 31 días";
  const start = startOfWeek(key);
  return `${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short" }).format(zonedStart(start, timezone))} — ${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short" }).format(zonedStart(addDays(start, 6), timezone))}`;
}

function itemVisual(type: CalendarType) {
  if (type === "mission") return { iconKey: "management.missions", fallback: Target };
  if (type === "event") return { iconKey: "marketing.events", fallback: Megaphone };
  if (type === "external") return { iconKey: "navigation.calendar", fallback: RefreshCw };
  return { iconKey: "management.classes", fallback: CalendarDays };
}

function itemLabel(type: CalendarType) {
  return ({ class: "Clase", mission: "Misión", event: "Evento", external: "Calendario" } as Record<CalendarType, string>)[type];
}

function publicUrl(client: SupabaseClient, path: string) {
  return client.storage.from("cya-icons").getPublicUrl(path).data.publicUrl;
}

function deterministicColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return GOOGLE_PALETTE[Math.abs(hash) % GOOGLE_PALETTE.length];
}

function calendarColor(item: CalendarItem, visual: VisualRow | undefined) {
  const metadataColor = item.metadata?.calendar_color;
  const externalId = item.external_calendar_id || item.metadata?.external_calendar_id || "google";
  return visual?.color_override || (metadataColor && /^#[0-9a-f]{6}$/i.test(metadataColor) ? metadataColor : deterministicColor(externalId));
}

function whatsappNumber(phone: string | null, countryCode: string | null) {
  if (!phone) return null;
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;
  if (!raw.startsWith("+") && !raw.startsWith("00")) {
    const normalizedCountry = (countryCode || "").trim().toUpperCase();
    const dialCode = COUNTRY_DIAL_CODES[normalizedCountry] || (/^\+?\d{1,4}$/.test(normalizedCountry) ? normalizedCountry.replace(/\D/g, "") : "");
    if (dialCode && !digits.startsWith(dialCode)) digits = `${dialCode}${digits}`;
  }
  return digits.length >= 8 ? digits : null;
}

function confirmationWhatsAppHref(item: PendingConfirmationClass, person: PendingParticipant) {
  const number = whatsappNumber(person.phone, person.country_code);
  if (!number) return null;
  const firstName = person.display_name.trim().split(/\s+/)[0] || "";
  const when = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.scheduled_start_at));
  const message = `Hola ${firstName}, tienes una clase con Carlos & Andy el ${when}. Cuando puedas, entra en CYA Hub y confirma tu asistencia desde la app: https://app.carlosyandy.com`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function AgendaView({ client, timezone, schedule, openClass, notify }: AgendaViewProps) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [key, setKey] = useState(() => localKey(new Date(), timezone));
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>(emptySnapshot);
  const [visuals, setVisuals] = useState<VisualRow[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmationClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<CalendarType, boolean>>({ class: true, mission: true, event: true, external: true });
  const range = useMemo(() => rangeFor(mode, key, timezone), [mode, key, timezone]);
  const visualByCalendar = useMemo(() => new Map(visuals.map((row) => [row.external_calendar_id, row])), [visuals]);

  const load = useCallback(async () => {
    setLoading(true);
    const [snapshotResult, visualResult, confirmationResult] = await Promise.all([
      client.rpc("calendar_snapshot", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
      client.from("calendar_visual_settings").select("external_calendar_id,calendar_name,icon_storage_path,color_override"),
      client.rpc("class_confirmation_agenda"),
    ]);
    if (snapshotResult.error) notify(snapshotResult.error.message);
    else setSnapshot(snapshotResult.data as CalendarSnapshot);
    if (!visualResult.error) setVisuals((visualResult.data ?? []) as VisualRow[]);
    if (confirmationResult.error) notify(confirmationResult.error.message);
    else setPendingConfirmations((confirmationResult.data ?? []) as PendingConfirmationClass[]);
    setLoading(false);
  }, [client, notify, range.from, range.to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const confirmationTimer = window.setInterval(() => void load(), 60_000);
    const onVisualsChanged = () => void load();
    const onClassConfirmed = () => void load();
    window.addEventListener("cya:calendar-visuals-changed", onVisualsChanged);
    window.addEventListener("cya:class-confirmed", onClassConfirmed);
    return () => {
      clearTimeout(timer);
      window.clearInterval(confirmationTimer);
      window.removeEventListener("cya:calendar-visuals-changed", onVisualsChanged);
      window.removeEventListener("cya:class-confirmed", onClassConfirmed);
    };
  }, [load]);

  const items = useMemo(() => [
    ...(snapshot.classes ?? []),
    ...(snapshot.missions ?? []),
    ...(snapshot.marketing_events ?? []),
    ...(snapshot.external_events ?? []),
  ].filter((item) => filters[item.type]).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [snapshot, filters]);

  function move(direction: number) {
    if (mode === "day") setKey(addDays(key, direction));
    else if (mode === "week") setKey(addDays(key, direction * 7));
    else if (mode === "list") setKey(addDays(key, direction * 31));
    else {
      const { year, month } = keyParts(key);
      const date = new Date(Date.UTC(year, month - 1 + direction, 1));
      setKey(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`);
    }
  }

  function renderItem(item: CalendarItem) {
    const visual = itemVisual(item.type);
    const externalId = item.external_calendar_id || item.metadata?.external_calendar_id || "";
    const calendarVisual = externalId ? visualByCalendar.get(externalId) : undefined;
    const color = item.type === "external" ? calendarColor(item, calendarVisual) : "#6D4AFF";
    const calendarName = item.metadata?.calendar_name || calendarVisual?.calendar_name || "Google Calendar";
    const itemStyle = item.type === "external"
      ? { borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${color}18, transparent 44%)` }
      : item.type === "class" ? { borderLeft: "4px solid #6D4AFF", background: "linear-gradient(90deg, rgba(109,74,255,.12), transparent 44%)" } : undefined;

    return <button className={`calendar-item type-${item.type}`} style={itemStyle} key={`${item.type}-${item.id}`} onClick={() => item.type === "class" && openClass(item.id)}>
      <span className="calendar-item-icon" style={{ position: "relative", overflow: "visible", border: `1px solid ${color}44`, color, background: `${color}16` }}>
        {item.type === "class" ? <>
          <img src="/cya-logo.png" alt="" style={{ width: 30, height: 30, objectFit: "contain" }} />
          <span style={{ position: "absolute", right: -5, bottom: -5, display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 7, border: "2px solid var(--panel,#111)", background: "#6D4AFF", color: "white" }}><CalendarDays size={10} /></span>
        </> : item.type === "external" && calendarVisual?.icon_storage_path ? <img src={publicUrl(client, calendarVisual.icon_storage_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} />
          : item.type === "external" ? <strong style={{ fontSize: 18, color }}>{calendarName.trim().charAt(0).toUpperCase() || "C"}</strong>
          : <CyaIcon iconKey={visual.iconKey} fallback={visual.fallback} />}
      </span>
      <span>
        <small style={item.type === "external" ? { color, fontWeight: 800 } : undefined}>{item.type === "external" ? calendarName : itemLabel(item.type)}</small>
        <strong>{item.title}</strong>
        <time>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at))}–{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.ends_at))}</time>
      </span>
      {item.type === "class" ? <CyaIcon iconKey="action.forward" fallback={ChevronRight} /> : <CyaIcon iconKey="state.success" fallback={CircleCheck} />}
    </button>;
  }

  const groups = new Map<string, CalendarItem[]>();
  items.forEach((item) => {
    const itemKey = localKey(new Date(item.starts_at), timezone);
    groups.set(itemKey, [...(groups.get(itemKey) ?? []), item]);
  });

  const monthFirst = monthStart(key);
  const monthGridStart = addDays(monthFirst, 1 - weekday(monthFirst));
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));

  return <>
    <header className="page-head agenda-head"><div><p className="eyebrow">Agenda</p><h1>Calendario CYA</h1><p>Clases, misiones, eventos y calendarios de Google diferenciados por color e identidad visual.</p></div><button className="btn" onClick={schedule}><CyaIcon iconKey="action.add" fallback={Plus} /> Programar clase</button></header>
    <GoogleCalendarSync client={client} notify={notify} onSynced={load} compact />

    {pendingConfirmations.length ? <section className="class-confirmation-agenda card" aria-labelledby="class-confirmation-agenda-title">
      <header className="class-confirmation-agenda-head">
        <div><span>POR CONFIRMAR</span><h2 id="class-confirmation-agenda-title">Clases esperando confirmación</h2><p>Aparecen desde las 08:00 del día anterior. Puedes recordar al alumno que confirme directamente desde CYA Hub.</p></div>
        <strong>{pendingConfirmations.length}</strong>
      </header>
      <div className="class-confirmation-agenda-list">{pendingConfirmations.map((item) => <article key={item.class_id} className="class-confirmation-agenda-item">
        <button type="button" className="class-confirmation-agenda-class" onClick={() => openClass(item.class_id)}>
          <CalendarDays />
          <span><strong>{new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduled_start_at))}</strong><small>{item.duration_minutes} min{item.location_text ? ` · ${item.location_text}` : ""}</small></span>
          <ChevronRight />
        </button>
        <div className="class-confirmation-agenda-people">{item.pending_participants.map((person) => {
          const href = confirmationWhatsAppHref(item, person);
          return <div key={person.person_id} className="class-confirmation-agenda-person">
            <span><strong>{person.display_name}</strong><small>Pendiente de confirmar</small></span>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer"><MessageCircle /> Pedir por WhatsApp</a> : <span className="class-confirmation-no-phone">Sin teléfono</span>}
          </div>;
        })}</div>
      </article>)}</div>
    </section> : null}

    <section className="calendar-toolbar card">
      <div className="calendar-nav"><button className="icon-btn" onClick={() => move(-1)} aria-label="Anterior"><CyaIcon iconKey="action.back" fallback={ChevronLeft} /></button><button className="today-button" onClick={() => setKey(localKey(new Date(), timezone))}>Hoy</button><button className="icon-btn" onClick={() => move(1)} aria-label="Siguiente"><CyaIcon iconKey="action.forward" fallback={ChevronRight} /></button><strong>{modeTitle(mode, key, timezone)}</strong></div>
      <div className="calendar-modes">{(["day", "week", "month", "list"] as CalendarMode[]).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "day" ? "Día" : value === "week" ? "Semana" : value === "month" ? "Mes" : "Lista"}</button>)}</div>
    </section>
    <div className="calendar-filters" aria-label="Filtros de agenda">{(["class", "mission", "event", "external"] as CalendarType[]).map((type) => <button key={type} className={filters[type] ? `active type-${type}` : ""} onClick={() => setFilters((current) => ({ ...current, [type]: !current[type] }))}>{itemLabel(type)}</button>)}</div>

    {mode === "month" ? <section className="month-calendar card">
      <div className="month-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => <span key={label}>{label}</span>)}</div>
      <div className="month-days">{monthDays.map((dayKey) => {
        const dayItems = groups.get(dayKey) ?? [];
        const inMonth = dayKey.slice(0, 7) === monthFirst.slice(0, 7);
        return <button key={dayKey} className={`${dayKey === localKey(new Date(), timezone) ? "today" : ""} ${inMonth ? "" : "outside"}`} onClick={() => { setKey(dayKey); setMode("day"); }}><strong>{Number(dayKey.slice(-2))}</strong><span>{dayItems.slice(0, 4).map((item) => {
          const externalId = item.external_calendar_id || item.metadata?.external_calendar_id || "";
          const calendarVisual = externalId ? visualByCalendar.get(externalId) : undefined;
          const dotStyle = item.type === "external" ? { backgroundColor: calendarColor(item, calendarVisual) } : item.type === "class" ? { backgroundColor: "#6D4AFF" } : undefined;
          return <i key={`${item.type}-${item.id}`} className={`type-${item.type}`} style={dotStyle} />;
        })}</span>{dayItems.length ? <small>{dayItems.length}</small> : null}</button>;
      })}</div>
    </section> : <section className="calendar-groups">
      {Array.from(groups.entries()).map(([dayKey, dayItems]) => <article className="calendar-day" key={dayKey}><header><span>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "short" }).format(zonedStart(dayKey, timezone))}</span><strong>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "long" }).format(zonedStart(dayKey, timezone))}</strong></header><div>{dayItems.map(renderItem)}</div></article>)}
      {!items.length ? <div className="empty"><CyaIcon iconKey="navigation.calendar" fallback={CalendarDays} /><strong>{loading ? "Actualizando agenda…" : "No hay nada en este periodo"}</strong><p>Los filtros activos no contienen clases, misiones ni eventos.</p></div> : null}
    </section>}
  </>;
}