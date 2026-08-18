import {
  type CalendarConnectionRow,
  googleCalendarJson,
  openCalendarSecret,
  refreshGoogleCalendarAccessToken,
  supabaseRequest,
} from "./google-calendar-server";

type GoogleCalendarEntry = {
  id?: string;
  summary?: string;
  accessRole?: string;
  deleted?: boolean;
  hidden?: boolean;
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
};

type ExistingExternal = {
  id: number;
  external_calendar_id: string | null;
  external_event_id: string | null;
};

export type SecondaryCalendarSyncMetrics = {
  calendars: number;
  imported: number;
  updated: number;
  removed: number;
};

function eventTimes(event: GoogleEvent) {
  const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00.000Z` : "");
  const end = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00.000Z` : "");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    allDay: Boolean(event.start?.date),
  };
}

async function listCalendars(googleToken: string) {
  const result = await googleCalendarJson<{ items?: GoogleCalendarEntry[] }>(
    googleToken,
    "/users/me/calendarList?showHidden=true&maxResults=250",
  );
  return (result.items ?? []).filter((calendar) => calendar.id && !calendar.deleted && calendar.accessRole !== "freeBusyReader");
}

async function listEvents(googleToken: string, calendarId: string, from: Date, to: Date) {
  const events: GoogleEvent[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "true",
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await googleCalendarJson<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      googleToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return events;
}

export async function syncSecondaryGoogleCalendars(
  accessToken: string,
  connection: CalendarConnectionRow,
): Promise<SecondaryCalendarSyncMetrics> {
  if (!connection.credential_reference || !connection.external_calendar_id) {
    throw new Error("La conexión de Google Calendar está incompleta.");
  }

  const metrics: SecondaryCalendarSyncMetrics = { calendars: 0, imported: 0, updated: 0, removed: 0 };
  const googleToken = await refreshGoogleCalendarAccessToken(openCalendarSecret(connection.credential_reference));
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000);
  const to = new Date(now.getTime() + 330 * 86400000);
  const calendars = await listCalendars(googleToken);
  const secondary = calendars.filter((calendar) => calendar.id !== connection.external_calendar_id);
  metrics.calendars = secondary.length + 1;

  const existingRows = await supabaseRequest<ExistingExternal[]>(
    `/rest/v1/calendar_events?select=id,external_calendar_id,external_event_id&connection_id=eq.${connection.id}&source_type=eq.external`,
    accessToken,
  );
  const existing = new Map(
    existingRows
      .filter((row) => row.external_calendar_id && row.external_event_id)
      .map((row) => [`${row.external_calendar_id}:${row.external_event_id}`, row]),
  );

  for (const calendar of secondary) {
    const calendarId = calendar.id!;
    const seen = new Set<string>();
    const events = await listEvents(googleToken, calendarId, from, to);

    for (const event of events) {
      if (!event.id) continue;
      const key = `${calendarId}:${event.id}`;
      seen.add(key);
      const row = existing.get(key);

      if (event.status === "cancelled") {
        if (row) {
          await supabaseRequest(`/rest/v1/calendar_events?id=eq.${row.id}`, accessToken, {
            method: "PATCH",
            headers: { prefer: "return=minimal" },
            body: JSON.stringify({ sync_status: "ignored", deleted_at: new Date().toISOString(), last_synced_at: new Date().toISOString() }),
          });
          metrics.removed += 1;
        }
        continue;
      }

      const times = eventTimes(event);
      if (!times) continue;
      const data = {
        connection_id: connection.id,
        provider: "google",
        external_calendar_id: calendarId,
        external_event_id: event.id,
        source_type: "external",
        source_id: null,
        title: event.summary?.trim() || "Ocupado",
        starts_at: times.startsAt,
        ends_at: times.endsAt,
        timezone: event.start?.timeZone || "Europe/Madrid",
        sync_status: "synced",
        external_etag: event.etag ?? null,
        remote_updated_at: event.updated ?? null,
        last_synced_at: new Date().toISOString(),
        deleted_at: null,
        conflict_data: {},
        metadata: {
          all_day: times.allDay,
          location: event.location ?? null,
          html_link: event.htmlLink ?? null,
          calendar_name: calendar.summary ?? "Google Calendar",
          read_only: true,
        },
      };

      if (row) {
        await supabaseRequest(`/rest/v1/calendar_events?id=eq.${row.id}`, accessToken, {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify(data),
        });
        metrics.updated += 1;
      } else {
        await supabaseRequest("/rest/v1/calendar_events", accessToken, {
          method: "POST",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify(data),
        });
        metrics.imported += 1;
      }
    }

    for (const [key, row] of existing) {
      if (!key.startsWith(`${calendarId}:`) || seen.has(key)) continue;
      await supabaseRequest(`/rest/v1/calendar_events?id=eq.${row.id}`, accessToken, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ sync_status: "ignored", deleted_at: new Date().toISOString(), last_synced_at: new Date().toISOString() }),
      });
      metrics.removed += 1;
    }
  }

  return metrics;
}
