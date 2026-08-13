"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

let shortcutClient: SupabaseClient | null = null;

async function client() {
  if (shortcutClient) return shortcutClient;
  const response = await fetch("/api/runtime-config", { cache: "no-store", headers: { accept: "application/json" } });
  const config = await response.json() as { configured?: boolean; supabaseUrl?: string; supabasePublishableKey?: string };
  if (!response.ok || !config.configured || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error("config");
  shortcutClient = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return shortcutClient;
}

export function StatisticsShortcut() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void client().then(async (db) => {
      const session = await db.auth.getSession();
      if (!session.data.session) return;
      const result = await db.rpc("teacher_statistics_snapshot", { p_days: 30 });
      if (!cancelled && !result.error) setVisible(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!visible) return null;
  return <Link href="/statistics" aria-label="Abrir estadísticas" className="statistics-global-shortcut"><BarChart3 /><span>Estadísticas</span></Link>;
}
