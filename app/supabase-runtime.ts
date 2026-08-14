"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

let runtimeClient: SupabaseClient | null = null;
const observedAuthClients = new WeakSet<object>();

function observeAuthChanges(client: SupabaseClient) {
  if (observedAuthClients.has(client)) return;
  observedAuthClients.add(client);
  client.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("cya:auth-change", { detail: event }));
    }, 0);
  });
}

export function setRuntimeSupabaseClient(client: SupabaseClient) {
  runtimeClient = client;
  observeAuthChanges(client);
}

export function getRuntimeSupabaseClient() {
  return runtimeClient;
}

export async function getRuntimeAccessToken() {
  const client = runtimeClient;
  if (!client) return null;
  const result = await client.auth.getSession();
  return result.data.session?.access_token ?? null;
}
