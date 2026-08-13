"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { P31CatalogAdmin as P31CatalogCore } from "./p31-catalog-admin-legacy";
import { P31DefaultsAdmin } from "./p31-defaults-admin";

export function P31CatalogAdmin({ client, notify }: { client: SupabaseClient; notify: (message: string) => void }) {
  return <section className="admin-stack">
    <P31CatalogCore client={client} notify={notify} />
    <P31DefaultsAdmin client={client} notify={notify} />
  </section>;
}
