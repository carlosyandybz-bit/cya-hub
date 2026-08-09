"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

let runtimeClient: SupabaseClient | null = null;

export function setRuntimeSupabaseClient(client: SupabaseClient) {
  runtimeClient = client;
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
