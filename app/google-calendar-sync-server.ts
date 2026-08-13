import { createHash } from "node:crypto";
import {
  type CalendarConnectionRow,
  googleCalendarJson,
  openCalendarSecret,
  refreshGoogleCalendarAccessToken,
  supabaseRequest,
} from "./google-calendar-server";

type LocalCalendarItem = {
  id: number;
  type: "class" | "mission" | "event";
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type CalendarSnapshot = {
  classes?: LocalCalendarItem[];
  missions?: LocalCalendarItem[];
  marketing_events?: LocalCalendarItem[];
};

type CalendarMapping = {
  id: number;
  connection_id: number | null;
  external_calendar_id: string | null;
  external_event_id: string | null;
  source_type: "external" | "class" | "mission" | "marketing_event" | "manual";
  source_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  sync_status: "local" | "pending" | "synced" | "conflict" | "error" | "ignored";
  external_etag: string | null;
  payload_hash: string | null;
  conflict_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  etag?: string;
  htmlLink?: string;
  location?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

type GoogleEventList = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type SyncMetrics = {
  imported: number;
  created: number;
  updated: number;
  removed: number;
  conflicts: number;
  unchanged: number;
  resetCursor: boolean;
};

const ACTIVE_MISSION_STATES = new Set(["upcoming", "available", "in_progress", "blocked", "postponed"]);

function sourceType(item: LocalCalendarItem): CalendarMapping["source_type"] {
  return item.type === "event" ? "marketing_event" : item.type;
}

function sourceKey(type: string, id: string | number) {
  return `${type}:${id}`;
}

function payloadHash(item: LocalCalendarItem) {
  return createHash("sha256").update(JSON.stringify({
    type: sourceType(item),
    id: String(item.id),
    title: item.title,
    starts_at: new Date(item.starts_at).toISOString(),
    ends_at: new Date(item.ends_at).toISOString(),
  })).digest("hex");
}

function googleEventBody(item: LocalCalendarItem) {
  return {
    summary: item.type === "class" ? `Clase · ${item.title}` : item.title,
    start: { dateTime: new Date(item.starts_at).toISOString(), timeZone: "Europe/Madrid" },
    end: { dateTime: new Date(item.ends_at).toISOString(), timeZone: "Europe/Madrid" },
    extendedProperties: {
      private: {
        cyaHub: "1",
        cyaSourceType: sourceType(item),
        cyaSourceId: String(item.id),
      },
    },
  };
}

function googleTimes(event: GoogleEvent) {
  const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00.000Z` : "");
  const end = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00.000Z` : "");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) return null;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), allDay: Boolean(event.start?.date) };
}

function inWindow(startsAt: string, endsAt: string, from: Date, to: Date) {
  return Date.parse(startsAt) < to.getTime() && Date.parse(endsAt) > from.getTime();
}

function calendarPath(calendarId: string, suffix = "") {
  return `/calendars/${encodeURIComponent(calendarId)}/events${suffix}`;
}

async function listGoogleChanges(accessToken: string, calendarId: string, syncCursor: string | null, from: Date, to: Date) {
  const items: GoogleEvent[] = [];
  let pageToken = "";
  let nextSyncToken = "";
  do {
    const params = new URLSearchParams({ maxResults: "2500", showDeleted: "true", singleEvents: "true" });
    if (syncCursor) params.set("syncToken", syncCursor);
    else {
      params.set("timeMin", from.toISOString());
      params.set("timeMax", to.toISOString());
    }
    if (pageToken) params.set("pageToken", pageToken);
    try {
      const page = await googleCalendarJson<GoogleEventList>(accessToken, `${calendarPath(calendarId)}?${params.toString()}`);
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken ?? "";
      if (!pageToken) nextSyncToken = page.nextSyncToken ?? "";
    } catch (error) {
      if (syncCursor && (error as Error & { status?: number }).status === 410) return { items: [] as GoogleEvent[], nextSyncToken: "", reset: true };
      throw error;
    }
  } while (pageToken);
  if (!nextSyncToken) throw new Error("Google Calendar no devolvió el cursor incremental de sincronización.");
  return { items, nextSyncToken, reset: false };
}

async function patchMapping(accessToken: string, id: number, changes: Record<string, unknown>) {
  await supabaseRequest(`/rest/v1/calendar_events?id=eq.${id}`, accessToken, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(changes),
  });
}

async function insertMapping(accessToken: string, row: Record<string, unknown>) {
  const result = await supabaseRequest<CalendarMapping[]>("/rest/v1/calendar_events?select=id,connection_id,external_calendar_id,external_event_id,source_type,source_id,title,starts_at,ends_at,sync_status,external_etag,payload_hash,conflict_data,metadata", accessToken, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!result?.[0]) throw new Error("No se pudo guardar el vínculo de calendario.");
  return result[0];
}

async function markConflict(accessToken: string, mapping: CalendarMapping, local: LocalCalendarItem, remote: GoogleEvent, reason: string) {
  const times = googleTimes(remote);
  await patchMapping(accessToken, mapping.id, {
    sync_status: "conflict",
    conflict_data: {
      reason,
      detected_at: new Date().toISOString(),
      remote_etag: remote.etag ?? null,
      remote: {
        title: remote.summary ?? "Sin título",
        starts_at: times?.startsAt ?? null,
        ends_at: times?.endsAt ?? null,
      },
      local: {
        title: local.title,
        starts_at: local.starts_at,
        ends_at: local.ends_at,
      },
    },
    remote_updated_at: remote.updated ?? null,
    last_synced_at: new Date().toISOString(),
  });
}

async function upsertExternalEvent(
  accessToken: string,
  connection: CalendarConnectionRow,
  mappingByExternal: Map<string, CalendarMapping>,
  event: GoogleEvent,
  from: Date,
  to: Date,
) {
  if (!event.id) return false;
  const existing = mappingByExternal.get(event.id);
  if (event.status === "cancelled") {
    if (existing && existing.sync_status !== "ignored") await patchMapping(accessToken, existing.id, { sync_status: "ignored", deleted_at: new Date().toISOString(), last_synced_at: new Date().toISOString() });
    return Boolean(existing);
  }
  const times = googleTimes(event);
  if (!times || !inWindow(times.startsAt, times.endsAt, from, to)) return false;
  const data = {
    title: event.summary?.trim() || "Ocupado",
    starts_at: times.startsAt,
    ends_at: times.endsAt,
    timezone: event.start?.timeZone || "Europe/Madrid",
    sync_status: "synced",
    external_etag: event.etag ?? null,
    remote_updated_at: event.updated ?? null,
    last_synced_at: new Date().toISOString(),
    deleted_at: null,
    metadata: {
      all_day: times.allDay,
      location: event.location ?? null,
      html_link: event.htmlLink ?? null,
    },
  };
  if (existing) {
    await patchMapping(accessToken, existing.id, data);
    return false;
  }
  const inserted = await insertMapping(accessToken, {
    connection_id: connection.id,
    provider: "google",
    external_calendar_id: connection.external_calendar_id,
    external_event_id: event.id,
    source_type: "external",
    source_id: null,
    ...data,
  });
  mappingByExternal.set(event.id, inserted);
  return true;
}

async function removeTerminalMappings(accessToken: string, googleToken: string, connection: CalendarConnectionRow, mappings: CalendarMapping[], activeKeys: Set<string>) {
  const candidates = mappings.filter((mapping) => mapping.source_type !== "external" && mapping.source_id && mapping.external_event_id && !activeKeys.has(sourceKey(mapping.source_type, mapping.source_id)));
  if (!candidates.length) return 0;
  const idsByType = new Map<string, string[]>();
  for (const mapping of candidates) idsByType.set(mapping.source_type, [...(idsByType.get(mapping.source_type) ?? []), mapping.source_id!]);
  const terminal = new Set<string>();

  const classIds = idsByType.get("class") ?? [];
  if (classIds.length) {
    const rows = await supabaseRequest<Array<{ id: number; status: string }>>(`/rest/v1/classes?select=id,status&id=in.(${classIds.join(",")})`, accessToken);
    rows.filter((row) => row.status === "cancelled").forEach((row) => terminal.add(sourceKey("class", row.id)));
  }
  const missionIds = idsByType.get("mission") ?? [];
  if (missionIds.length) {
    const rows = await supabaseRequest<Array<{ id: number; state: string }>>(`/rest/v1/missions?select=id,state&id=in.(${missionIds.join(",")})`, accessToken);
    rows.filter((row) => !ACTIVE_MISSION_STATES.has(row.state)).forEach((row) => terminal.add(sourceKey("mission", row.id)));
  }
  const eventIds = idsByType.get("marketing_event") ?? [];
  if (eventIds.length) {
    const rows = await supabaseRequest<Array<{ id: number; status: string }>>(`/rest/v1/marketing_events?select=id,status&id=in.(${eventIds.join(",")})`, accessToken);
    rows.filter((row) => row.status === "cancelled").forEach((row) => terminal.add(sourceKey("marketing_event", row.id)));
  }

  let removed = 0;
  for (const mapping of candidates) {
    if (!mapping.source_id || !mapping.external_event_id || !terminal.has(sourceKey(mapping.source_type, mapping.source_id))) continue;
    try {
      await googleCalendarJson(googleToken, calendarPath(connection.external_calendar_id!, `/${encodeURIComponent(mapping.external_event_id)}`), {
        method: "DELETE",
        headers: mapping.external_etag ? { "if-match": mapping.external_etag } : undefined,
      });
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status !== 404 && status !== 410) throw error;
    }
    await patchMapping(accessToken, mapping.id, { sync_status: "ignored", deleted_at: new Date().toISOString(), last_synced_at: new Date().toISOString() });
    removed += 1;
  }
  return removed;
}

export async function syncGoogleCalendar(accessToken: string, connection: CalendarConnectionRow, lockToken: string) {
  if (!connection.external_calendar_id || !connection.credential_reference) throw new Error("La conexión de Google Calendar está incompleta.");
  const metrics: SyncMetrics = { imported: 0, created: 0, updated: 0, removed: 0, conflicts: 0, unchanged: 0, resetCursor: false };
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000);
  const to = new Date(now.getTime() + 330 * 86400000);
  const googleToken = await refreshGoogleCalendarAccessToken(openCalendarSecret(connection.credential_reference));
  const snapshot = await supabaseRequest<CalendarSnapshot>("/rest/v1/rpc/calendar_snapshot", accessToken, {
    method: "POST",
    body: JSON.stringify({ p_from: from.toISOString(), p_to: to.toISOString() }),
  });
  const localItems = [...(snapshot.classes ?? []), ...(snapshot.missions ?? []), ...(snapshot.marketing_events ?? [])];
  const localByKey = new Map(localItems.map((item) => [sourceKey(sourceType(item), item.id), item]));
  const activeKeys = new Set(localByKey.keys());

  const mappings = await supabaseRequest<CalendarMapping[]>(`/rest/v1/calendar_events?select=id,connection_id,external_calendar_id,external_event_id,source_type,source_id,title,starts_at,ends_at,sync_status,external_etag,payload_hash,conflict_data,metadata&connection_id=eq.${connection.id}`, accessToken);
  const mappingBySource = new Map<string, CalendarMapping>();
  const mappingByExternal = new Map<string, CalendarMapping>();
  for (const mapping of mappings) {
    if (mapping.source_id && mapping.source_type !== "external") mappingBySource.set(sourceKey(mapping.source_type, mapping.source_id), mapping);
    if (mapping.external_event_id) mappingByExternal.set(mapping.external_event_id, mapping);
  }

  let changes = await listGoogleChanges(googleToken, connection.external_calendar_id, connection.sync_cursor, from, to);
  if (changes.reset) {
    metrics.resetCursor = true;
    changes = await listGoogleChanges(googleToken, connection.external_calendar_id, null, from, to);
  }

  for (const remote of changes.items) {
    const privateData = remote.extendedProperties?.private ?? {};
    const linkedType = privateData.cyaHub === "1" ? privateData.cyaSourceType : "";
    const linkedId = privateData.cyaHub === "1" ? privateData.cyaSourceId : "";
    if (linkedType && linkedId) {
      const key = sourceKey(linkedType, linkedId);
      const local = localByKey.get(key);
      const mapping = mappingBySource.get(key) ?? (remote.id ? mappingByExternal.get(remote.id) : undefined);
      if (!local) continue;
      if (!mapping) {
        if (remote.status !== "cancelled" && remote.id) {
          const inserted = await insertMapping(accessToken, {
            connection_id: connection.id,
            provider: "google",
            external_calendar_id: connection.external_calendar_id,
            external_event_id: remote.id,
            source_type: linkedType,
            source_id: linkedId,
            title: local.title,
            starts_at: local.starts_at,
            ends_at: local.ends_at,
            timezone: "Europe/Madrid",
            sync_status: "synced",
            external_etag: remote.etag ?? null,
            payload_hash: payloadHash(local),
            remote_updated_at: remote.updated ?? null,
            last_synced_at: new Date().toISOString(),
            conflict_data: {},
            metadata: { managed_by_cya: true },
          });
          mappingBySource.set(key, inserted);
          if (remote.id) mappingByExternal.set(remote.id, inserted);
        }
        continue;
      }
      const remoteChanged = Boolean(remote.etag && mapping.external_etag && remote.etag !== mapping.external_etag);
      const remoteDeleted = remote.status === "cancelled";
      if (remoteDeleted || remoteChanged) {
        await markConflict(accessToken, mapping, local, remote, remoteDeleted ? "deleted_in_google" : "changed_in_google");
        mapping.sync_status = "conflict";
        metrics.conflicts += 1;
      }
      continue;
    }

    if (connection.sync_direction !== "cya_to_external") {
      const imported = await upsertExternalEvent(accessToken, connection, mappingByExternal, remote, from, to);
      if (imported) metrics.imported += 1;
    }
  }

  if (connection.sync_direction !== "external_to_cya") {
    for (const local of localItems) {
      const key = sourceKey(sourceType(local), local.id);
      const hash = payloadHash(local);
      let mapping = mappingBySource.get(key);
      if (mapping?.sync_status === "conflict") continue;
      if (!mapping?.external_event_id) {
        const created = await googleCalendarJson<GoogleEvent>(googleToken, calendarPath(connection.external_calendar_id), {
          method: "POST",
          body: JSON.stringify(googleEventBody(local)),
        });
        if (!created.id) throw new Error("Google no devolvió el ID del evento creado.");
        const mappingData = {
          external_calendar_id: connection.external_calendar_id,
          external_event_id: created.id,
          title: local.title,
          starts_at: local.starts_at,
          ends_at: local.ends_at,
          timezone: "Europe/Madrid",
          sync_status: "synced",
          external_etag: created.etag ?? null,
          payload_hash: hash,
          remote_updated_at: created.updated ?? null,
          last_synced_at: new Date().toISOString(),
          conflict_data: {},
          metadata: { managed_by_cya: true },
          deleted_at: null,
        };
        if (mapping) {
          await patchMapping(accessToken, mapping.id, mappingData);
          mapping = { ...mapping, ...mappingData } as CalendarMapping;
        } else {
          mapping = await insertMapping(accessToken, {
            connection_id: connection.id,
            provider: "google",
            source_type: sourceType(local),
            source_id: String(local.id),
            ...mappingData,
          });
        }
        mappingBySource.set(key, mapping);
        mappingByExternal.set(created.id, mapping);
        metrics.created += 1;
        continue;
      }
      if (mapping.payload_hash === hash) {
        metrics.unchanged += 1;
        continue;
      }
      try {
        const updated = await googleCalendarJson<GoogleEvent>(googleToken, calendarPath(connection.external_calendar_id, `/${encodeURIComponent(mapping.external_event_id)}`), {
          method: "PATCH",
          headers: mapping.external_etag ? { "if-match": mapping.external_etag } : undefined,
          body: JSON.stringify(googleEventBody(local)),
        });
        await patchMapping(accessToken, mapping.id, {
          title: local.title,
          starts_at: local.starts_at,
          ends_at: local.ends_at,
          sync_status: "synced",
          external_etag: updated.etag ?? mapping.external_etag,
          payload_hash: hash,
          remote_updated_at: updated.updated ?? null,
          last_synced_at: new Date().toISOString(),
          conflict_data: {},
          deleted_at: null,
        });
        metrics.updated += 1;
      } catch (error) {
        if ((error as Error & { status?: number }).status === 412) {
          await patchMapping(accessToken, mapping.id, {
            sync_status: "conflict",
            conflict_data: { reason: "etag_mismatch", detected_at: new Date().toISOString(), local: { title: local.title, starts_at: local.starts_at, ends_at: local.ends_at } },
            last_synced_at: new Date().toISOString(),
          });
          metrics.conflicts += 1;
          continue;
        }
        throw error;
      }
    }
    metrics.removed = await removeTerminalMappings(accessToken, googleToken, connection, mappings, activeKeys);
  }

  const finished = await supabaseRequest<boolean>("/rest/v1/rpc/finish_calendar_sync", accessToken, {
    method: "POST",
    body: JSON.stringify({ p_connection_id: connection.id, p_lock_token: lockToken, p_sync_cursor: changes.nextSyncToken }),
  });
  if (!finished) throw new Error("El lock de sincronización de Google Calendar dejó de ser válido.");
  return metrics;
}
