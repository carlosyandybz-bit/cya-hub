"use client";

import { AlertTriangle, CalendarCheck, Link2, RefreshCw, Unlink } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

type Connection = {
  id: number;
  external_calendar_id: string | null;
  display_name: string | null;
  status: "disconnected" | "connecting" | "connected" | "error" | "paused";
  sync_enabled: boolean;
  sync_direction: "two_way" | "cya_to_external" | "external_to_cya";
  last_synced_at: string | null;
  last_error: string | null;
  sync_started_at: string | null;
  sync_error_count: number;
};

type Conflict = {
  id: number;
  title: string;
  source_type: string;
  conflict_data: { reason?: string; remote?: { title?: string; starts_at?: string; ends_at?: string } } | null;
};

type ServerStatus = {
  configured: boolean;
  configurationMessage?: string;
  missingRequirements?: Array<"google_oauth" | "server_encryption" | "supabase_runtime">;
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
  onSynced?: () => void | Promise<void>;
  compact?: boolean;
};

const directionLabels: Record<Connection["sync_direction"], string> = {
  two_way: "CYA ↔ Google",
  cya_to_external: "CYA → Google",
  external_to_cya: "Google → Agenda",
};

async function responseJson(response: Response) {
  return await response.json().catch(() => null) as { error?: string; [key: string]: unknown } | null;
}

export function GoogleCalendarSync({ client, notify, onSynced, compact = false }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configurationMessage, setConfigurationMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Tu sesión ha caducado. Vuelve a entrar en CYA Hub.");
    return fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  }, [client]);

  const load = useCallback(async () => {
    const result = await client.from("calendar_connections")
      .select("id,external_calendar_id,display_name,status,sync_enabled,sync_direction,last_synced_at,last_error,sync_started_at,sync_error_count")
      .eq("provider", "google")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) {
      notify(result.error.message);
      return;
    }
    const current = (result.data ?? null) as Connection | null;
    setConnection(current);
    if (current?.id) {
      const conflictResult = await client.from("calendar_events")
        .select("id,title,source_type,conflict_data")
        .eq("connection_id", current.id)
        .eq("sync_status", "conflict")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (!conflictResult.error) setConflicts((conflictResult.data ?? []) as Conflict[]);
    } else setConflicts([]);
    try {
      const statusResponse = await authFetch("/api/google-calendar/status");
      const status = await responseJson(statusResponse) as ServerStatus & { error?: string } | null;
      const isConfigured = Boolean(statusResponse.ok && status?.configured);
      setConfigured(isConfigured);
      setConfigurationMessage(
        typeof status?.configurationMessage === "string"
          ? status.configurationMessage
          : !statusResponse.ok && status?.error
            ? status.error
            : null,
      );
    } catch {
      setConfigured(false);
      setConfigurationMessage("No se pudo comprobar la preparación de Google Calendar en este momento.");
    }
  }, [authFetch, client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "cya-google-calendar") return;
      const message = String(event.data?.message || (event.data?.ok ? "Google Calendar conectado." : "No se pudo conectar Google Calendar."));
      notify(message);
      void load();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [load, notify]);

  async function connect() {
    setBusy("connect");
    try {
      const response = await authFetch("/api/google-calendar/connect", { method: "POST" });
      const body = await responseJson(response);
      if (!response.ok || typeof body?.url !== "string") throw new Error(body?.error || "No se pudo iniciar Google Calendar.");
      const popup = window.open(body.url, "cya-google-calendar", "popup=yes,width=560,height=720");
      if (!popup) window.location.assign(body.url);
      else popup.focus();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo conectar Google Calendar.");
    } finally {
      setBusy("");
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      const response = await authFetch("/api/google-calendar/sync", { method: "POST" });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body?.error || "No se pudo sincronizar Google Calendar.");
      await load();
      await onSynced?.();
      notify("Google Calendar sincronizado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo sincronizar Google Calendar.");
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const response = await authFetch("/api/google-calendar/disconnect", { method: "POST" });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body?.error || "No se pudo desconectar Google Calendar.");
      await load();
      await onSynced?.();
      notify("Google Calendar desconectado de CYA Hub.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo desconectar Google Calendar.");
    } finally {
      setBusy("");
    }
  }

  async function changeDirection(value: Connection["sync_direction"]) {
    if (!connection) return;
    setBusy("direction");
    const result = await client.from("calendar_connections").update({ sync_direction: value }).eq("id", connection.id);
    if (result.error) notify(result.error.message);
    else { await load(); notify(`Sincronización: ${directionLabels[value]}.`); }
    setBusy("");
  }

  async function resolveConflict(eventId: number) {
    setBusy(`conflict-${eventId}`);
    try {
      const response = await authFetch("/api/google-calendar/resolve", {
        method: "POST",
        body: JSON.stringify({ eventId, strategy: "keep_cya" }),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body?.error || "No se pudo resolver el conflicto.");
      const syncResponse = await authFetch("/api/google-calendar/sync", { method: "POST" });
      const syncBody = await responseJson(syncResponse);
      if (!syncResponse.ok) throw new Error(syncBody?.error || "El conflicto quedó preparado, pero Google aún no se pudo actualizar.");
      await load();
      await onSynced?.();
      notify("Conflicto resuelto manteniendo CYA como fuente de verdad.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo resolver el conflicto.");
    } finally {
      setBusy("");
    }
  }

  const connected = Boolean(connection && connection.status !== "disconnected" && connection.sync_enabled);
  const syncing = Boolean(connection?.sync_started_at);
  const lastSync = connection?.last_synced_at
    ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(connection.last_synced_at))
    : null;

  return <article className={`card pad ${compact ? "calendar-connection-compact" : "calendar-connection-card"}`}>
    <div className="card-head">
      <div><p className="eyebrow">Google Calendar</p><h2>{connected ? connection?.display_name || "Calendario conectado" : "Sincronización de agenda"}</h2></div>
      <span className={`badge ${connected ? "portal" : ""}`}>{connected ? (syncing ? "Sincronizando" : "Conectada") : configured === false ? "No configurada" : "Desconectada"}</span>
    </div>
    {!connected ? <>
      <p>{configured === false
        ? configurationMessage || "Google Calendar todavía no está preparado en el servidor."
        : "Conecta tu calendario para ver tus eventos externos en Agenda y reflejar las clases, misiones y eventos de CYA sin duplicarlos."}</p>
      <button className="btn" type="button" disabled={busy === "connect" || configured === false || configured === null} onClick={() => void connect()}><Link2 /> {busy === "connect" ? "Abriendo Google…" : "Conectar Google Calendar"}</button>
    </> : <>
      <div className="admin-read-list">
        <div><span>Dirección</span><select aria-label="Dirección de sincronización de Google Calendar" value={connection!.sync_direction} disabled={Boolean(busy)} onChange={(event) => void changeDirection(event.target.value as Connection["sync_direction"])}><option value="two_way">CYA ↔ Google</option><option value="cya_to_external">CYA → Google</option><option value="external_to_cya">Google → Agenda</option></select></div>
        <div><span>Última sincronización</span><strong>{lastSync ?? "Todavía no realizada"}</strong></div>
        {connection?.last_error ? <div><span>Último error</span><strong>{connection.last_error}</strong></div> : null}
      </div>
      <div className="actions">
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void sync()}><RefreshCw /> {busy === "sync" ? "Sincronizando…" : "Sincronizar ahora"}</button>
        {!compact ? <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void disconnect()}><Unlink /> Desconectar</button> : null}
      </div>
      {conflicts.length ? <div className="status-list">
        {conflicts.map((conflict) => <div key={conflict.id}><AlertTriangle /><span><strong>Conflicto · {conflict.title}</strong><small>Google modificó un evento gestionado por CYA. No se ha cambiado la clase ni sus datos.</small></span><button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void resolveConflict(conflict.id)}>Mantener CYA</button></div>)}
      </div> : <div className="status-list"><div><CalendarCheck /><span>Sin conflictos pendientes</span></div></div>}
    </>}
  </article>;
}
