"use client";

import { BarChart3, GraduationCap, House, LibraryBig, Megaphone, UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

type ModuleSetting = { module_key: string; label: string; sort_order: number };

const iconByModule = {
  home: House,
  students: UsersRound,
  teaching: LibraryBig,
  marketing: Megaphone,
  statistics: BarChart3,
  academy: GraduationCap,
} as const;

const fallbackModules: ModuleSetting[] = [
  { module_key: "home", label: "Inicio", sort_order: 10 },
  { module_key: "students", label: "Alumnado", sort_order: 20 },
  { module_key: "teaching", label: "Enseñanza", sort_order: 30 },
  { module_key: "marketing", label: "Marketing", sort_order: 40 },
  { module_key: "statistics", label: "Estadísticas", sort_order: 50 },
  { module_key: "academy", label: "Academia Online", sort_order: 60 },
];

export function DesktopPrimaryNavigation({
  client,
  view,
  studentArea,
  navigate,
}: {
  client: SupabaseClient;
  view: string;
  studentArea: boolean;
  navigate: (view: string) => void;
}) {
  const [modules, setModules] = useState<ModuleSetting[]>(fallbackModules);

  const load = useCallback(async () => {
    const result = await client.from("app_module_settings").select("module_key,label,sort_order").order("sort_order").order("module_key");
    if (!result.error && result.data?.length) setModules(result.data as ModuleSetting[]);
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const isActive = (key: string) => key === "students" ? studentArea : view === key;

  return <nav aria-label="Módulos principales">
    {modules.map((module) => {
      const Icon = iconByModule[module.module_key as keyof typeof iconByModule];
      if (!Icon) return null;
      return <span key={module.module_key}>
        <button className={isActive(module.module_key) ? "active" : ""} onClick={() => navigate(module.module_key)}><Icon />{module.label}</button>
        {module.module_key === "students" ? <button className={view === "live" ? "active" : ""} onClick={() => navigate("live")}><GraduationCap />Dar clase</button> : null}
      </span>;
    })}
  </nav>;
}
