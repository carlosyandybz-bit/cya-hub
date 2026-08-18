"use client";

import { CalendarDays, ImageUp, RotateCcw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = { client: SupabaseClient; notify: (message: string) => void };
type EventRow = { external_calendar_id: string | null; metadata: Record<string, unknown> | null };
type VisualRow = { external_calendar_id: string; calendar_name: string; icon_storage_path: string | null; color_override: string | null };
type CalendarSource = { id: string; name: string; color: string };

const MAX_ICON_BYTES = 512 * 1024;
const ALLOWED_ICON_TYPES = new Set(["image/png", "image/webp"]);
export const GOOGLE_CALENDAR_PALETTE = ["#7986CB", "#33B679", "#8E24AA", "#E67C73", "#F6BF26", "#F4511E", "#039BE5", "#616161", "#3F51B5", "#0B8043", "#D50000"];

function publicUrl(client: SupabaseClient, path: string) {
  return client.storage.from("cya-icons").getPublicUrl(path).data.publicUrl;
}

function deterministicColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return GOOGLE_CALENDAR_PALETTE[Math.abs(hash) % GOOGLE_CALENDAR_PALETTE.length];
}

function cleanColor(value: unknown, fallbackKey: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : deterministicColor(fallbackKey);
}

export function CalendarVisualAdmin({ client, notify }: Props) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [settings, setSettings] = useState<VisualRow[]>([]);
  const [busy, setBusy] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const [eventResult, settingsResult] = await Promise.all([
      client.from("calendar_events").select("external_calendar_id,metadata").eq("source_type", "external").neq("sync_status", "ignored").limit(1000),
      client.from("calendar_visual_settings").select("external_calendar_id,calendar_name,icon_storage_path,color_override"),
    ]);
    if (eventResult.error) notify(eventResult.error.message);
    if (settingsResult.error) notify(settingsResult.error.message);
    setEvents((eventResult.data ?? []) as EventRow[]);
    setSettings((settingsResult.data ?? []) as VisualRow[]);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const byId = useMemo(() => new Map(settings.map((row) => [row.external_calendar_id, row])), [settings]);
  const calendars = useMemo(() => {
    const map = new Map<string, CalendarSource>();
    for (const event of events) {
      if (!event.external_calendar_id) continue;
      const metadata = event.metadata ?? {};
      const name = typeof metadata.calendar_name === "string" && metadata.calendar_name.trim() ? metadata.calendar_name : "Google Calendar";
      const color = cleanColor(metadata.calendar_color, event.external_calendar_id);
      map.set(event.external_calendar_id, { id: event.external_calendar_id, name, color });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [events]);

  async function save(source: CalendarSource, changes: Partial<VisualRow>) {
    setBusy(source.id);
    const session = await client.auth.getSession();
    const current = byId.get(source.id);
    const result = await client.from("calendar_visual_settings").upsert({
      external_calendar_id: source.id,
      calendar_name: source.name,
      icon_storage_path: changes.icon_storage_path === undefined ? current?.icon_storage_path ?? null : changes.icon_storage_path,
      color_override: changes.color_override === undefined ? current?.color_override ?? null : changes.color_override,
      updated_by: session.data.session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,external_calendar_id" });
    if (result.error) notify(result.error.message);
    else {
      await load();
      window.dispatchEvent(new Event("cya:calendar-visuals-changed"));
      notify("Identidad visual del calendario actualizada.");
    }
    setBusy("");
  }

  async function upload(source: CalendarSource, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_ICON_TYPES.has(file.type)) return notify("La imagen debe ser PNG o WebP.");
    if (file.size > MAX_ICON_BYTES) return notify("La imagen debe pesar como máximo 512 KB.");
    const extension = file.type === "image/webp" ? "webp" : "png";
    const nextPath = `calendar/${source.id.replace(/[^a-z0-9._-]/gi, "-")}/${crypto.randomUUID()}.${extension}`;
    const previous = byId.get(source.id)?.icon_storage_path ?? null;
    setBusy(source.id);
    const uploadResult = await client.storage.from("cya-icons").upload(nextPath, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (uploadResult.error) { setBusy(""); return notify(uploadResult.error.message); }
    await save(source, { icon_storage_path: nextPath });
    if (previous) await client.storage.from("cya-icons").remove([previous]);
  }

  async function resetIcon(source: CalendarSource) {
    const previous = byId.get(source.id)?.icon_storage_path;
    if (!previous) return;
    await save(source, { icon_storage_path: null });
    await client.storage.from("cya-icons").remove([previous]);
  }

  return <article className="card pad calendar-visual-admin">
    <div className="card-head"><div><p className="eyebrow">Identidad visual</p><h2>Calendarios y eventos</h2></div><CalendarDays /></div>
    <p>Cada calendario tiene un color propio basado en la paleta de Google Calendar. Puedes cambiarlo y subir una imagen que se usará como icono de todos sus eventos dentro de CYA Hub.</p>
    {!calendars.length ? <div className="compact-empty"><CalendarDays /><span>Sincroniza Google Calendar para cargar sus calendarios y personalizarlos.</span></div> : <div className="calendar-visual-list">{calendars.map((source) => {
      const visual = byId.get(source.id);
      const color = visual?.color_override || source.color;
      return <section className="calendar-visual-row" key={source.id} style={{ borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${color}18, transparent 42%)` }}>
        <div className="calendar-visual-preview" style={{ borderColor: color, color }}>
          {visual?.icon_storage_path ? <img src={publicUrl(client, visual.icon_storage_path)} alt="" /> : <span>{source.name.trim().charAt(0).toUpperCase() || "C"}</span>}
        </div>
        <div className="calendar-visual-meta"><strong>{source.name}</strong><small>Google Calendar</small>
          <div className="calendar-color-palette" aria-label={`Color de ${source.name}`}>{GOOGLE_CALENDAR_PALETTE.map((swatch) => <button type="button" key={swatch} aria-label={`Usar color ${swatch}`} className={color.toUpperCase() === swatch ? "active" : ""} style={{ backgroundColor: swatch }} disabled={busy === source.id} onClick={() => void save(source, { color_override: swatch })} />)}</div>
        </div>
        <div className="calendar-visual-actions">
          <input ref={(node) => { inputs.current[source.id] = node; }} type="file" hidden accept="image/png,image/webp" onChange={(event) => void upload(source, event)} />
          <button className="btn ghost" type="button" disabled={busy === source.id} onClick={() => inputs.current[source.id]?.click()}><ImageUp /> {visual?.icon_storage_path ? "Cambiar icono" : "Subir icono"}</button>
          {visual?.icon_storage_path ? <button className="btn ghost" type="button" disabled={busy === source.id} onClick={() => void resetIcon(source)}><RotateCcw /> Restaurar</button> : null}
        </div>
      </section>;
    })}</div>}
  </article>;
}
