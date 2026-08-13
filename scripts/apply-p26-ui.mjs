import fs from "node:fs";

function patch(path, mutate) {
  const before = fs.readFileSync(path, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, got ${count}`);
  return text.replace(from, to);
}

patch("app/agenda-view.tsx", (text) => {
  text = replaceOnce(text,
    'import type { CalendarItem, CalendarSnapshot } from "./v14-types";\n',
    'import type { CalendarItem, CalendarSnapshot } from "./v14-types";\nimport { GoogleCalendarSync } from "./google-calendar-sync";\n',
    "agenda import");
  text = replaceOnce(text,
    '    <section className="calendar-toolbar card">',
    '    <GoogleCalendarSync client={client} notify={notify} onSynced={load} compact />\n    <section className="calendar-toolbar card">',
    "agenda calendar control");
  return text;
});

patch("app/admin-view.tsx", (text) => {
  text = replaceOnce(text,
    'import { AdminDailyQuotes } from "./admin-daily-quotes";\n',
    'import { AdminDailyQuotes } from "./admin-daily-quotes";\nimport { GoogleCalendarSync } from "./google-calendar-sync";\n',
    "admin import");
  text = replaceOnce(text,
    '<div className="integration-grid">{data.integrations.map((integration) =>',
    '<div className="integration-grid"><GoogleCalendarSync client={client} notify={notify} />{data.integrations.filter((integration) => integration.integration_key !== "google_calendar").map((integration) =>',
    "admin integration card");
  return text;
});

patch("app/v14-types.ts", (text) => replaceOnce(text,
  '  status: string;\n};\n\nexport type CalendarSnapshot',
  '  status: string;\n  external_event_id?: string | null;\n  metadata?: { html_link?: string | null; location?: string | null; all_day?: boolean };\n};\n\nexport type CalendarSnapshot',
  "calendar item metadata"));

patch(".env.example", (text) => replaceOnce(text,
  'GOOGLE_DRIVE_TEACHING_FOLDER_NAME=CYA Hub - Enseñanza\nCYA_SERVER_SECRET=',
  'GOOGLE_DRIVE_TEACHING_FOLDER_NAME=CYA Hub - Enseñanza\n\n# Google Calendar OAuth. Client ID/secret fall back to the Drive OAuth client when these are empty.\n# Add the production callback URL to the OAuth client: https://<tu-dominio>/api/google-calendar/callback\nGOOGLE_CALENDAR_CLIENT_ID=\nGOOGLE_CALENDAR_CLIENT_SECRET=\n# Optional explicit callback. Leave empty to derive it from the current CYA Hub origin.\nGOOGLE_CALENDAR_REDIRECT_URI=\nCYA_SERVER_SECRET=',
  "env calendar"));

patch("db/migrations/v63_p26_google_calendar_sync.sql", (text) => {
  text = replaceOnce(text,
    "    and status = 'connected'\n    and sync_enabled = true",
    "    and status in ('connected','error')\n    and sync_enabled = true",
    "retry errored connection");
  text = replaceOnce(text,
    '  set sync_cursor = p_sync_cursor,\n      last_synced_at = now(),\n      sync_completed_at = now(),\n      sync_started_at = null,\n      sync_lock_token = null,\n      sync_error_count = 0,\n      last_error = null,\n      updated_at = now()',
    "  set sync_cursor = p_sync_cursor,\n      last_synced_at = now(),\n      sync_completed_at = now(),\n      sync_started_at = null,\n      sync_lock_token = null,\n      sync_error_count = 0,\n      last_error = null,\n      status = 'connected',\n      updated_at = now()",
    "successful sync restores connected");
  return text;
});

patch("app/google-calendar-sync-server.ts", (text) => {
  const from = `      if (!mapping?.external_event_id) {\n        const created = await googleCalendarJson<GoogleEvent>(googleToken, calendarPath(connection.external_calendar_id), {\n          method: "POST",\n          body: JSON.stringify(googleEventBody(local)),\n        });\n        if (!created.id) throw new Error("Google no devolvió el ID del evento creado.");\n        mapping = await insertMapping(accessToken, {\n          connection_id: connection.id,\n          provider: "google",\n          external_calendar_id: connection.external_calendar_id,\n          external_event_id: created.id,\n          source_type: sourceType(local),\n          source_id: String(local.id),\n          title: local.title,\n          starts_at: local.starts_at,\n          ends_at: local.ends_at,\n          timezone: "Europe/Madrid",\n          sync_status: "synced",\n          external_etag: created.etag ?? null,\n          payload_hash: hash,\n          remote_updated_at: created.updated ?? null,\n          last_synced_at: new Date().toISOString(),\n          conflict_data: {},\n          metadata: { managed_by_cya: true },\n        });\n        mappingBySource.set(key, mapping);\n        mappingByExternal.set(created.id, mapping);\n        metrics.created += 1;\n        continue;\n      }`;
  const to = `      if (!mapping?.external_event_id) {\n        const created = await googleCalendarJson<GoogleEvent>(googleToken, calendarPath(connection.external_calendar_id), {\n          method: "POST",\n          body: JSON.stringify(googleEventBody(local)),\n        });\n        if (!created.id) throw new Error("Google no devolvió el ID del evento creado.");\n        const mappingData = {\n          external_calendar_id: connection.external_calendar_id,\n          external_event_id: created.id,\n          title: local.title,\n          starts_at: local.starts_at,\n          ends_at: local.ends_at,\n          timezone: "Europe/Madrid",\n          sync_status: "synced",\n          external_etag: created.etag ?? null,\n          payload_hash: hash,\n          remote_updated_at: created.updated ?? null,\n          last_synced_at: new Date().toISOString(),\n          conflict_data: {},\n          metadata: { managed_by_cya: true },\n          deleted_at: null,\n        };\n        if (mapping) {\n          await patchMapping(accessToken, mapping.id, mappingData);\n          mapping = { ...mapping, ...mappingData } as CalendarMapping;\n        } else {\n          mapping = await insertMapping(accessToken, {\n            connection_id: connection.id,\n            provider: "google",\n            source_type: sourceType(local),\n            source_id: String(local.id),\n            ...mappingData,\n          });\n        }\n        mappingBySource.set(key, mapping);\n        mappingByExternal.set(created.id, mapping);\n        metrics.created += 1;\n        continue;\n      }`;
  return replaceOnce(text, from, to, "recreate deleted CYA event");
});

console.log("P26 exact UI/sync patch applied");
