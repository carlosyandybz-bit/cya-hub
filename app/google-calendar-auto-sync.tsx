"use client";

import { useEffect } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

const DEBOUNCE_MS = 450;
const CLIENT_WAIT_MS = 250;

async function triggerSync(client: SupabaseClient) {
  const session = await client.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return;

  const response = await fetch("/api/google-calendar/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // 409 is benign here: another class change can arrive while the previous
  // synchronization still owns the lock. The next change/explicit sync will
  // converge to the same idempotent Calendar mapping.
  if (!response.ok && response.status !== 409) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    console.warn("CYA Google Calendar auto-sync:", body?.error || response.statusText);
  }
}

export function GoogleCalendarAutoSync() {
  useEffect(() => {
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let clientTimer = 0;
    let syncTimer = 0;
    let syncing = false;
    let rerun = false;

    const schedule = (client: SupabaseClient) => {
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        if (disposed) return;
        if (syncing) {
          rerun = true;
          return;
        }
        syncing = true;
        void triggerSync(client).finally(() => {
          syncing = false;
          if (rerun && !disposed) {
            rerun = false;
            schedule(client);
          }
        });
      }, DEBOUNCE_MS);
    };

    const attach = () => {
      if (disposed) return;
      const client = getRuntimeSupabaseClient();
      if (!client) {
        clientTimer = window.setTimeout(attach, CLIENT_WAIT_MS);
        return;
      }

      channel = client
        .channel("cya-google-calendar-class-auto-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => schedule(client))
        .on("postgres_changes", { event: "*", schema: "public", table: "class_participants" }, () => schedule(client))
        .subscribe();
    };

    attach();

    return () => {
      disposed = true;
      window.clearTimeout(clientTimer);
      window.clearTimeout(syncTimer);
      if (channel) void channel.unsubscribe();
    };
  }, []);

  return null;
}
