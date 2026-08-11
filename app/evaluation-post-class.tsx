"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, LockKeyhole, Settings2, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./evaluation-post-class.module.css";

type Participant = { person_id:number; role_term_id:number|null; level_term_id:number|null };
type PendingClass = {
  id:number;
  style_term_id:number|null;
  scheduled_start_at:string;
  administrative_finished_at:string|null;
  class_participants:Participant[];
};
type SessionRow = { id:number; person_id:number; status:string; style_term_id:number; role_term_id:number; level_term_id:number };
type ProgressRow = {
  id:number;
  person_id:number;
  style_term_id:number;
  role_term_id:number;
  level_term_id:number;
  aptitude_term_id:number;
  raw_score:number;
  effective_score:number;
  pending_milestone_id:number|null;
};
type Milestone = { id:number; aptitude_term_id:number; label:string; threshold_score:number };
type Descriptor = { id:number; milestone_id:number; label:string; description:string|null; internal_score:number; sort_order:number };
type Person = { id:number; display_name:string };
type Term = { id:number; label:string };

const staffRoles = new Set(["admin","teacher_admin","teacher"]);

function dateLabel(value:string) {
  return new Intl.DateTimeFormat("es-ES", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
}

export function EvaluationPostClassGate() {
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [pendingClass,setPendingClass]=useState<PendingClass|null>(null);
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [progress,setProgress]=useState<ProgressRow[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [descriptors,setDescriptors]=useState<Descriptor[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [selectedDescriptors,setSelectedDescriptors]=useState<Record<number,number>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [handledClassIds,setHandledClassIds]=useState<number[]>([]);

  useEffect(() => {
    let cancelled=false;
    let resolved=false;
    const inspect=async () => {
      if (resolved) return;
      const runtime=getRuntimeSupabaseClient();
      if (!runtime) return;
      const sessionResult=await runtime.auth.getSession();
      const userId=sessionResult.data.session?.user.id;
      if (!userId || cancelled) return;
      const roleResult=await runtime.from("app_member_roles").select("role,active").eq("user_id",userId).eq("active",true);
      if (cancelled || roleResult.error) return;
      const roles=(roleResult.data ?? []).map((row) => String(row.role));
      if (!roles.some((role) => staffRoles.has(role))) { resolved=true; return; }
      resolved=true;
      setIsAdmin(roles.includes("admin") || roles.includes("teacher_admin"));
      setClient(runtime);
    };
    void inspect();
    const timer=window.setInterval(() => void inspect(),1000);
    return () => { cancelled=true; window.clearInterval(timer); };
  },[]);

  const findPendingClass=useCallback(async () => {
    if (!client) return;
    const result=await client.from("classes")
      .select("id,style_term_id,scheduled_start_at,administrative_finished_at,class_participants(person_id,role_term_id,level_term_id)")
      .eq("status","finished")
      .not("administrative_finished_at","is",null)
      .is("pedagogy_closed_at",null)
      .order("administrative_finished_at",{ascending:true})
      .limit(10);
    if (result.error) { setError(result.error.message); return; }
    const rows=(result.data ?? []) as unknown as PendingClass[];
    setPendingClass(rows.find((row) => !handledClassIds.includes(row.id)) ?? null);
  },[client,handledClassIds]);

  useEffect(() => {
    if (!client) return;
    const first=window.setTimeout(() => void findPendingClass(),0);
    const timer=window.setInterval(() => void findPendingClass(),5000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  },[client,findPendingClass]);

  const loadEvaluation=useCallback(async (item:PendingClass) => {
    if (!client || !item.style_term_id || !item.class_participants.length) return;
    setBusy("prepare"); setError("");
    const prepared:SessionRow[]=[];
    for (const participant of item.class_participants) {
      if (!participant.role_term_id || !participant.level_term_id) {
        setError("La clase no tiene rol o nivel suficiente para registrar la evaluación.");
        setBusy("");
        return;
      }
      const result=await client.rpc("prepare_post_class_evaluation",{p_class_id:item.id,p_person_id:participant.person_id});
      if (result.error) { setError(result.error.message); setBusy(""); return; }
      prepared.push(result.data as SessionRow);
    }
    setSessions(prepared);
    const ids=item.class_participants.map((row) => row.person_id);
    const [progressResult,peopleResult]=await Promise.all([
      client.from("student_aptitude_progress").select("id,person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,raw_score,effective_score,pending_milestone_id").in("person_id",ids),
      client.from("people").select("id,display_name").in("id",ids),
    ]);
    if (progressResult.error || peopleResult.error) { setError(progressResult.error?.message || peopleResult.error?.message || "No se pudo preparar la evaluación."); setBusy(""); return; }
    const exact=((progressResult.data ?? []) as ProgressRow[]).filter((row) => item.class_participants.some((participant) => participant.person_id===row.person_id && participant.role_term_id===row.role_term_id && participant.level_term_id===row.level_term_id) && row.style_term_id===item.style_term_id);
    setProgress(exact);
    setPeople((peopleResult.data ?? []) as Person[]);
    const aptitudeIds=[...new Set(exact.map((row) => row.aptitude_term_id))];
    const milestoneIds=[...new Set(exact.map((row) => row.pending_milestone_id).filter((id):id is number => Boolean(id)))];
    const termPromise=aptitudeIds.length ? client.from("catalog_terms").select("id,label").in("id",aptitudeIds) : Promise.resolve({data:[],error:null});
    const milestonePromise=milestoneIds.length ? client.from("evaluation_milestones").select("id,aptitude_term_id,label,threshold_score").in("id",milestoneIds) : Promise.resolve({data:[],error:null});
    const descriptorPromise=milestoneIds.length ? client.from("evaluation_descriptors").select("id,milestone_id,label,description,internal_score,sort_order").in("milestone_id",milestoneIds).eq("active",true).order("sort_order") : Promise.resolve({data:[],error:null});
    const [termResult,milestoneResult,descriptorResult]=await Promise.all([termPromise,milestonePromise,descriptorPromise]);
    const firstError=termResult.error || milestoneResult.error || descriptorResult.error;
    if (firstError) { setError(firstError.message); setBusy(""); return; }
    setTerms((termResult.data ?? []) as Term[]);
    setMilestones((milestoneResult.data ?? []) as Milestone[]);
    setDescriptors((descriptorResult.data ?? []) as Descriptor[]);
    setBusy("");
  },[client]);

  useEffect(() => {
    if (!pendingClass) return;
    const timer=window.setTimeout(() => void loadEvaluation(pendingClass),0);
    return () => window.clearTimeout(timer);
  },[loadEvaluation,pendingClass]);

  const pendingProgress=progress.filter((row) => row.pending_milestone_id!==null);
  const aptitudeLabel=(id:number) => terms.find((term) => term.id===id)?.label ?? "Aptitud";
  const personName=(id:number) => people.find((person) => person.id===id)?.display_name ?? "Alumno";
  const milestoneFor=(row:ProgressRow) => milestones.find((milestone) => milestone.id===row.pending_milestone_id) ?? null;

  async function decide(row:ProgressRow,decision:"accepted"|"rejected") {
    if (!client || !pendingClass) return;
    const session=sessions.find((item) => item.person_id===row.person_id);
    const milestone=milestoneFor(row);
    if (!session || !milestone) return;
    const options=descriptors.filter((descriptor) => descriptor.milestone_id===milestone.id);
    const descriptorId=selectedDescriptors[row.id] || 0;
    if (options.length && !descriptorId) { setError(`Selecciona primero lo que observas en ${aptitudeLabel(row.aptitude_term_id)}.`); return; }
    setBusy(`decision-${row.id}`); setError("");
    const result=await client.rpc("decide_evaluation_milestone",{
      p_session_id:session.id,p_progress_id:row.id,p_decision:decision,p_descriptor_id:descriptorId || null,p_note:null,
    });
    if (result.error) { setError(result.error.message); setBusy(""); return; }
    await loadEvaluation(pendingClass);
    setBusy("");
  }

  async function finish() {
    if (!client || !pendingClass) return;
    setBusy("finish"); setError("");
    for (const session of sessions) {
      const result=await client.rpc("complete_post_class_evaluation",{p_session_id:session.id});
      if (result.error) { setError(result.error.message); setBusy(""); return; }
    }
    setHandledClassIds((current) => [...current,pendingClass.id]);
    setPendingClass(null);
    setBusy("");
  }

  const canFinish=Boolean(pendingClass && sessions.length===pendingClass.class_participants.length && pendingProgress.length===0 && busy!=="prepare");
  const average=useMemo(() => progress.length ? Math.round(progress.reduce((sum,row) => sum+Number(row.effective_score || 0),0)/progress.length) : 0,[progress]);

  if (!pendingClass) return null;

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Evaluación posterior a la clase">
    <section className={styles.panel}>
      <header className={styles.header}>
        <div><p>Después de la clase</p><h1>Evaluación de progreso</h1><span>{dateLabel(pendingClass.scheduled_start_at)} · la parte administrativa ya está terminada</span></div>
        <div className={styles.headerScore}><TrendingUp/><strong>{average}</strong><small>estado interno</small></div>
      </header>
      <div className={styles.notice}><LockKeyhole/><div><strong>Sin números manuales</strong><span>CYA calcula el progreso. Solo intervienes cuando un alumno alcanza un hito configurado.</span></div></div>
      {busy==="prepare" ? <div className={styles.loading}><span/><p>Preparando la evaluación posterior a la clase…</p></div> : null}
      {busy!=="prepare" ? <div className={styles.people}>{pendingClass.class_participants.map((participant) => {
        const rows=progress.filter((row) => row.person_id===participant.person_id);
        const pending=rows.filter((row) => row.pending_milestone_id!==null);
        return <article key={participant.person_id} className={styles.personCard}>
          <div className={styles.personHead}><div><span>Alumno</span><h2>{personName(participant.person_id)}</h2></div><b>{pending.length ? `${pending.length} hito${pending.length===1?"":"s"}` : "Sin hitos pendientes"}</b></div>
          <div className={styles.progressList}>{rows.map((row) => { const milestone=milestoneFor(row), options=milestone ? descriptors.filter((descriptor) => descriptor.milestone_id===milestone.id) : []; return <div className={styles.progressRow} key={row.id}>
            <div className={styles.progressTitle}><strong>{aptitudeLabel(row.aptitude_term_id)}</strong><span>{row.effective_score}/100</span></div>
            <div className={styles.track}><i style={{width:`${Math.max(0,Math.min(100,row.effective_score))}%`}}/></div>
            {milestone ? <div className={styles.milestone}>
              <div><span>Hito alcanzado · {milestone.threshold_score}</span><strong>{milestone.label}</strong></div>
              {options.length ? <div className={styles.descriptors}>{options.map((descriptor) => <button type="button" key={descriptor.id} className={selectedDescriptors[row.id]===descriptor.id?styles.selected:""} onClick={() => setSelectedDescriptors((current) => ({...current,[row.id]:descriptor.id}))}><strong>{descriptor.label}</strong>{descriptor.description ? <span>{descriptor.description}</span> : null}</button>)}</div> : <p className={styles.noDescriptors}>Este hito aún no tiene descriptores configurados.</p>}
              <div className={styles.actions}><button type="button" className={styles.reject} disabled={busy===`decision-${row.id}`} onClick={() => void decide(row,"rejected")}><XCircle/> Todavía no</button><button type="button" className={styles.accept} disabled={busy===`decision-${row.id}`} onClick={() => void decide(row,"accepted")}><CheckCircle2/> Hito demostrado</button></div>
            </div> : null}
          </div>; })}</div>
        </article>;
      })}</div> : null}
      {error ? <div className={styles.error}>{error}{isAdmin ? <Link href="/evaluation-settings"><Settings2/> Configurar evaluación</Link> : null}</div> : null}
      {!pendingProgress.length && !busy.includes("decision") && busy!=="prepare" ? <div className={styles.ready}><CheckCircle2/><div><strong>Evaluación lista</strong><span>El estado de todas las aptitudes queda registrado en esta clase. No necesitas introducir ninguna puntuación.</span></div></div> : null}
      <footer className={styles.footer}><span>La documentación y el mensaje al alumno se cierran después, en el resumen pedagógico.</span><button type="button" disabled={!canFinish || busy==="finish"} onClick={() => void finish()}>{busy==="finish"?"Guardando…":"Registrar evaluación y continuar"}</button></footer>
    </section>
  </div>;
}
