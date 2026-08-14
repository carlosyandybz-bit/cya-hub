"use client";

import { ArrowDown, ArrowUp, GraduationCap, RefreshCw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./academy-online.module.css";

type ModuleSetting = { module_key: string; label: string; sort_order: number };
type AcademyProgram = { id: number; publication_status: string; active: boolean; price_cents: number | null };
type AcademyEnrollment = { id: number; status: string };

export function AcademyOnlineAdmin({ client, notify }: { client: SupabaseClient; notify: (message: string) => void }) {
  const [modules, setModules] = useState<ModuleSetting[]>([]);
  const [programs, setPrograms] = useState<AcademyProgram[]>([]);
  const [enrollments, setEnrollments] = useState<AcademyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [moduleResult, programResult, enrollmentResult] = await Promise.all([
      client.from("app_module_settings").select("module_key,label,sort_order").order("sort_order").order("module_key"),
      client.from("academy_programs").select("id,publication_status,active,price_cents").order("sort_order").order("id"),
      client.from("academy_enrollments").select("id,status").order("created_at", { ascending: false }),
    ]);
    const error = moduleResult.error ?? programResult.error ?? enrollmentResult.error;
    if (error) notify(error.message);
    setModules((moduleResult.data ?? []) as ModuleSetting[]);
    setPrograms((programResult.data ?? []) as AcademyProgram[]);
    setEnrollments((enrollmentResult.data ?? []) as AcademyEnrollment[]);
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function move(moduleKey: string, direction: "up" | "down") {
    setBusy(`${moduleKey}-${direction}`);
    const result = await client.rpc("admin_move_module", { p_module_key: moduleKey, p_direction: direction });
    if (result.error) notify(result.error.message);
    else {
      setModules(((result.data ?? []) as ModuleSetting[]).sort((a, b) => a.sort_order - b.sort_order || a.module_key.localeCompare(b.module_key)));
      notify("Orden de módulos actualizado.");
    }
    setBusy("");
  }

  const activePrograms = useMemo(() => programs.filter((program) => program.active && program.publication_status === "published").length, [programs]);
  const pendingPrograms = useMemo(() => programs.filter((program) => program.publication_status === "draft").length, [programs]);
  const activeEnrollments = useMemo(() => enrollments.filter((enrollment) => enrollment.status === "active").length, [enrollments]);

  return <section className={styles.shell}>
    <header className={`card pad ${styles.hero}`}>
      <div className={styles.heroText}><p className="eyebrow">Academia Online</p><h2>Gobernanza</h2><p>Ordena los módulos principales y supervisa el estado de Academia. El contenido y los precios se editan dentro del módulo Academia Online.</p></div>
      <GraduationCap />
    </header>

    <div className={styles.metrics}>
      <article className={`card pad ${styles.metric}`}><span>Programas</span><strong>{programs.length}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Publicados</span><strong>{activePrograms}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Borradores</span><strong>{pendingPrograms}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Matrículas activas</span><strong>{activeEnrollments}</strong></article>
    </div>

    <article className="card pad">
      <div className="card-head"><div><p className="eyebrow">Navegación</p><h2>Orden de módulos</h2></div><button className="icon-btn" type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar"><RefreshCw /></button></div>
      <p>Este orden gobierna los módulos de escritorio y los accesos configurables. DAR CLASE permanece fijo en el centro de la barra móvil.</p>
      <div className={styles.moduleList}>
        {modules.map((module, index) => <div className={`card ${styles.moduleRow}`} key={module.module_key}>
          <span><strong>{index + 1}. {module.label}</strong><small>{module.module_key === "academy" ? "Nuevo módulo" : "Módulo principal"}</small></span>
          <div className={styles.rowActions}>
            <button className="icon-btn" type="button" disabled={index === 0 || Boolean(busy)} onClick={() => void move(module.module_key, "up")} aria-label={`Subir ${module.label}`}><ArrowUp /></button>
            <button className="icon-btn" type="button" disabled={index === modules.length - 1 || Boolean(busy)} onClick={() => void move(module.module_key, "down")} aria-label={`Bajar ${module.label}`}><ArrowDown /></button>
          </div>
        </div>)}
        {!modules.length && !loading ? <div className={styles.empty}>No hay módulos configurados.</div> : null}
      </div>
    </article>
  </section>;
}
