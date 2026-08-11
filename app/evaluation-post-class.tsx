"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, CircleDot, LockKeyhole, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
type SessionRow = {
  id:number;
  person_id:number;
  status:string;
  style_term_id:number;
  role_term_id:number;
  level_term_id:number;
  evaluation_kind:string;
};
type CandidateSession = {
  class_id:number|null;
  person_id:number;
  status:string;
  style_term_id:number;
  role_term_id:number;
};
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
type EvaluationRow = {
  id:number;
  session_id:number|null;
  aptitude_term_id:number;
  answer_scale_term_id:number|null;
  descriptor_id:number|null;
  answer_label:string|null;
  reviewed_at:string|null;
  score:number;
};
type Milestone = {
  id:number;
  style_term_id:number;
  role_term_id:number;
  level_term_id:number;
  aptitude_term_id:number;
  label:string;
  threshold_score:number;
};
type Descriptor = {
  id:number;
  milestone_id:number;
  label:string;
  description:string|null;
  internal_score:number;
  sort_order:number;
};
type ScaleTerm = { id:number; label:string; sort_order:number };
type Person = { id:number; display_name:string };
type Term = { id:number; label:string };
type StyleTerm = { id:number; term_key:string };
type ClassEvent = { person_id:number; content_id:number };
type Recommendation = {
  id:number;
  content_id:number;
  style_term_id:number;
  role_term_id:number;
  level_term_id:number;
  aptitude_term_id:number;
};

const staffRoles = new Set(["admin","teacher_admin","teacher"]);
const dualStyleKeys = ["bachata","bachazouk"];

function dateLabel(value:string) {
  return new Intl.DateTimeFormat("es-ES", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
}

function contextKey(personId:number,styleId:number,roleId:number,levelId:number) {
  return `${personId}:${styleId}:${roleId}:${levelId}`;
}

export function EvaluationPostClassGate() {
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [pendingClass,setPendingClass]=useState<PendingClass|null>(null);
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [progress,setProgress]=useState<ProgressRow[]>([]);
  const [evaluations,setEvaluations]=useState<EvaluationRow[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [descriptors,setDescriptors]=useState<Descriptor[]>([]);
  const [scaleTerms,setScaleTerms]=useState<ScaleTerm[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [classEvents,setClassEvents]=useState<ClassEvent[]>([]);
  const [recommendations,setRecommendations]=useState<Recommendation[]>([]);
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
    const classResult=await client.from("classes")
      .select("id,style_term_id,scheduled_start_at,administrative_finished_at,class_participants(person_id,role_term_id,level_term_id)")
      .eq("status","finished")
      .not("administrative_finished_at","is",null)
      .is("pedagogy_closed_at",null)
      .order("administrative_finished_at",{ascending:true})
      .limit(10);
    if (classResult.error) { setError(classResult.error.message); return; }

    const rows=((classResult.data ?? []) as unknown as PendingClass[])
      .filter((row) => !handledClassIds.includes(row.id));
    if (!rows.length) {
      setPendingClass((current) => current ? null : current);
      return;
    }

    const classIds=rows.map((row) => row.id);
    const participantIds=[...new Set(rows.flatMap((row) => row.class_participants.map((participant) => participant.person_id)))];
    const roleIds=[...new Set(rows.flatMap((row) => row.class_participants.map((participant) => participant.role_term_id).filter((id): id is number => Boolean(id))))];

    const [sessionResult,styleResult]=await Promise.all([
      client.from("evaluation_sessions")
        .select("class_id,person_id,status,style_term_id,role_term_id")
        .in("class_id",classIds),
      client.from("catalog_terms")
        .select("id,term_key")
        .eq("taxonomy","dance_style")
        .in("term_key",dualStyleKeys),
    ]);
    const lookupError=sessionResult.error || styleResult.error;
    if (lookupError) { setError(lookupError.message); return; }

    const currentSessions=(sessionResult.data ?? []) as CandidateSession[];
    const dualStyles=(styleResult.data ?? []) as StyleTerm[];
    const dualStyleIds=dualStyles.map((row) => row.id);

    const historyResult=participantIds.length && roleIds.length && dualStyleIds.length
      ? await client.from("evaluation_sessions")
        .select("class_id,person_id,status,style_term_id,role_term_id")
        .in("person_id",participantIds)
        .in("role_term_id",roleIds)
        .in("style_term_id",dualStyleIds)
        .eq("status","completed")
      : {data:[],error:null};
    if (historyResult.error) { setError(historyResult.error.message); return; }
    const completedDualHistory=(historyResult.data ?? []) as CandidateSession[];

    const stillNeedsReview=(item:PendingClass) => {
      if (!item.style_term_id || !item.class_participants.length) return false;
      const classStyleKey=dualStyles.find((style) => style.id===item.style_term_id)?.term_key ?? null;

      return item.class_participants.some((participant) => {
        if (!participant.role_term_id || !participant.level_term_id) return true;
        const participantSessions=currentSessions.filter((session) =>
          session.class_id===item.id &&
          session.person_id===participant.person_id &&
          session.role_term_id===participant.role_term_id
        );

        if (participantSessions.some((session) => session.status!=="completed")) return true;
        if (!participantSessions.some((session) => session.status==="completed" && session.style_term_id===item.style_term_id)) return true;

        if (!classStyleKey || !dualStyleKeys.includes(classStyleKey) || dualStyleIds.length<2) return false;
        const hasBothStylesHistorically=dualStyleIds.every((styleId) => completedDualHistory.some((session) =>
          session.person_id===participant.person_id &&
          session.role_term_id===participant.role_term_id &&
          session.style_term_id===styleId
        ));
        if (!hasBothStylesHistorically) return false;

        return dualStyleIds.some((styleId) => !participantSessions.some((session) =>
          session.status==="completed" && session.style_term_id===styleId
        ));
      });
    };

    const next=rows.find(stillNeedsReview) ?? null;
    setPendingClass((current) => current?.id===next?.id ? current : next);
  },[client,handledClassIds]);

  useEffect(() => {
    if (!client || pendingClass) return;
    let cancelled=false;
    const refresh=() => {
      if (!cancelled && document.visibilityState==="visible") void findPendingClass();
    };
    const first=window.setTimeout(refresh,0);
    const timer=window.setInterval(refresh,30000);
    document.addEventListener("visibilitychange",refresh);
    return () => {
      cancelled=true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refresh);
    };
  },[client,findPendingClass,pendingClass]);

  const loadEvaluation=useCallback(async (item:PendingClass) => {
    if (!client || !item.style_term_id || !item.class_participants.length) return;
    setBusy("prepare");
    setError("");

    const prepared:SessionRow[]=[];
    for (const participant of item.class_participants) {
      if (!participant.role_term_id || !participant.level_term_id) {
        setError("La clase no tiene rol o nivel suficiente para registrar la evaluación.");
        setBusy("");
        return;
      }
      const result=await client.rpc("prepare_post_class_evaluations",{
        p_class_id:item.id,
        p_person_id:participant.person_id,
      });
      if (result.error) { setError(result.error.message); setBusy(""); return; }
      const rows=Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      prepared.push(...(rows as SessionRow[]));
    }
    if (!prepared.length) {
      setError("No se ha podido preparar ninguna revisión para esta clase.");
      setBusy("");
      return;
    }

    if (prepared.every((session) => session.status==="completed")) {
      setHandledClassIds((current) => current.includes(item.id) ? current : [...current,item.id]);
      setPendingClass((current) => current?.id===item.id ? null : current);
      setBusy("");
      return;
    }

    setSessions(prepared);

    const personIds=[...new Set(item.class_participants.map((row) => row.person_id))];
    const styleIds=[...new Set(prepared.map((row) => row.style_term_id))];
    const roleIds=[...new Set(prepared.map((row) => row.role_term_id))];
    const levelIds=[...new Set(prepared.map((row) => row.level_term_id))];

    const [progressResult,peopleResult,scaleResult,eventResult]=await Promise.all([
      client.from("student_aptitude_progress")
        .select("id,person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,raw_score,effective_score,pending_milestone_id")
        .in("person_id",personIds),
      client.from("people").select("id,display_name").in("id",personIds),
      client.from("catalog_terms").select("id,label,sort_order").eq("taxonomy","evaluation_scale").eq("active",true).order("sort_order"),
      client.from("class_content_events").select("person_id,content_id").eq("class_id",item.id),
    ]);
    const baseError=progressResult.error || peopleResult.error || scaleResult.error || eventResult.error;
    if (baseError) { setError(baseError.message); setBusy(""); return; }

    const preparedContexts=new Set(prepared.map((row) => contextKey(row.person_id,row.style_term_id,row.role_term_id,row.level_term_id)));
    const exact=((progressResult.data ?? []) as ProgressRow[]).filter((row) =>
      preparedContexts.has(contextKey(row.person_id,row.style_term_id,row.role_term_id,row.level_term_id))
    );
    setProgress(exact);
    setPeople((peopleResult.data ?? []) as Person[]);
    setScaleTerms((scaleResult.data ?? []) as ScaleTerm[]);
    setClassEvents((eventResult.data ?? []) as ClassEvent[]);

    const aptitudeIds=[...new Set(exact.map((row) => row.aptitude_term_id))];
    const sessionIds=prepared.map((row) => row.id);
    const contentIds=[...new Set(((eventResult.data ?? []) as ClassEvent[]).map((row) => row.content_id))];
    const termIds=[...new Set([...aptitudeIds,...styleIds])];

    const termResult=termIds.length
      ? await client.from("catalog_terms").select("id,label").in("id",termIds)
      : {data:[],error:null};
    if (termResult.error) { setError(termResult.error.message); setBusy(""); return; }
    setTerms((termResult.data ?? []) as Term[]);

    const evaluationResult=sessionIds.length
      ? await client.from("student_evaluations")
        .select("id,session_id,aptitude_term_id,answer_scale_term_id,descriptor_id,answer_label,reviewed_at,score")
        .in("session_id",sessionIds)
      : {data:[],error:null};
    if (evaluationResult.error) { setError(evaluationResult.error.message); setBusy(""); return; }
    setEvaluations((evaluationResult.data ?? []) as EvaluationRow[]);

    const milestoneResult=aptitudeIds.length && styleIds.length && roleIds.length && levelIds.length
      ? await client.from("evaluation_milestones")
        .select("id,style_term_id,role_term_id,level_term_id,aptitude_term_id,label,threshold_score")
        .in("style_term_id",styleIds)
        .in("role_term_id",roleIds)
        .in("level_term_id",levelIds)
        .in("aptitude_term_id",aptitudeIds)
        .eq("active",true)
      : {data:[],error:null};
    if (milestoneResult.error) { setError(milestoneResult.error.message); setBusy(""); return; }
    const nextMilestones=(milestoneResult.data ?? []) as Milestone[];
    setMilestones(nextMilestones);

    const milestoneIds=nextMilestones.map((row) => row.id);
    const descriptorResult=milestoneIds.length
      ? await client.from("evaluation_descriptors")
        .select("id,milestone_id,label,description,internal_score,sort_order")
        .in("milestone_id",milestoneIds)
        .eq("active",true)
        .order("sort_order")
      : {data:[],error:null};
    if (descriptorResult.error) { setError(descriptorResult.error.message); setBusy(""); return; }
    setDescriptors((descriptorResult.data ?? []) as Descriptor[]);

    const recommendationResult=contentIds.length && aptitudeIds.length && styleIds.length && roleIds.length && levelIds.length
      ? await client.from("teaching_content_evaluation_recommendations")
        .select("id,content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id")
        .in("content_id",contentIds)
        .in("style_term_id",styleIds)
        .in("role_term_id",roleIds)
        .in("level_term_id",levelIds)
        .in("aptitude_term_id",aptitudeIds)
        .eq("active",true)
      : {data:[],error:null};
    if (recommendationResult.error) { setError(recommendationResult.error.message); setBusy(""); return; }
    setRecommendations((recommendationResult.data ?? []) as Recommendation[]);
    setBusy("");
  },[client]);

  useEffect(() => {
    if (!pendingClass) return;
    const timer=window.setTimeout(() => void loadEvaluation(pendingClass),0);
    return () => window.clearTimeout(timer);
  },[loadEvaluation,pendingClass]);

  const termLabel=(id:number) => terms.find((term) => term.id===id)?.label ?? "—";
  const aptitudeLabel=(id:number) => termLabel(id)==="—" ? "Aptitud" : termLabel(id);
  const styleLabel=(id:number) => termLabel(id)==="—" ? "Estilo" : termLabel(id);
  const personName=(id:number) => people.find((person) => person.id===id)?.display_name ?? "Alumno";
  const sessionFor=(row:ProgressRow) => sessions.find((session) =>
    session.person_id===row.person_id &&
    session.style_term_id===row.style_term_id &&
    session.role_term_id===row.role_term_id &&
    session.level_term_id===row.level_term_id
  ) ?? null;
  const evaluationFor=(row:ProgressRow) => {
    const session=sessionFor(row);
    return session ? evaluations.find((item) => item.session_id===session.id && item.aptitude_term_id===row.aptitude_term_id) ?? null : null;
  };
  const descriptorOptionsFor=(row:ProgressRow) => {
    const ids=new Set(milestones.filter((milestone) =>
      milestone.style_term_id===row.style_term_id &&
      milestone.role_term_id===row.role_term_id &&
      milestone.level_term_id===row.level_term_id &&
      milestone.aptitude_term_id===row.aptitude_term_id
    ).map((milestone) => milestone.id));
    return descriptors.filter((descriptor) => ids.has(descriptor.milestone_id)).sort((a,b) => a.internal_score-b.internal_score || a.sort_order-b.sort_order);
  };
  const isRecommended=(row:ProgressRow) => {
    const contentIds=new Set(classEvents.filter((event) => event.person_id===row.person_id).map((event) => event.content_id));
    return recommendations.some((recommendation) =>
      contentIds.has(recommendation.content_id) &&
      recommendation.style_term_id===row.style_term_id &&
      recommendation.role_term_id===row.role_term_id &&
      recommendation.level_term_id===row.level_term_id &&
      recommendation.aptitude_term_id===row.aptitude_term_id
    );
  };

  async function reviewAnswer(row:ProgressRow,value:string) {
    if (!client || !pendingClass || !value) return;
    const session=sessionFor(row);
    if (!session || session.status==="completed") return;
    const descriptorId=value.startsWith("d:") ? Number(value.slice(2)) : null;
    const scaleId=value.startsWith("s:") ? Number(value.slice(2)) : null;
    if (!descriptorId && !scaleId) return;

    setBusy(`review-${row.id}`);
    setError("");
    const result=await client.rpc("review_evaluation_question",{
      p_session_id:session.id,
      p_progress_id:row.id,
      p_scale_term_id:scaleId,
      p_descriptor_id:descriptorId,
      p_note:null,
    });
    if (result.error) { setError(result.error.message); setBusy(""); return; }

    const updated=result.data as EvaluationRow|null;
    if (updated) {
      setEvaluations((current) => {
        const index=current.findIndex((item) => item.session_id===updated.session_id && item.aptitude_term_id===updated.aptitude_term_id);
        if (index<0) return [...current,updated];
        const next=[...current];
        next[index]=updated;
        return next;
      });
      setProgress((current) => current.map((item) => item.id===row.id
        ? {...item,raw_score:updated.score,effective_score:updated.score}
        : item));
    }
    setBusy("");
  }

  async function finish() {
    if (!client || !pendingClass) return;
    setBusy("finish");
    setError("");
    for (const session of sessions) {
      const result=await client.rpc("complete_post_class_evaluation",{p_session_id:session.id});
      if (result.error) { setError(result.error.message); setBusy(""); return; }
    }
    setHandledClassIds((current) => current.includes(pendingClass.id) ? current : [...current,pendingClass.id]);
    setPendingClass(null);
    setBusy("");
  }

  const actionableProgress=progress.filter((row) => sessionFor(row)?.status!=="completed");
  const reviewedCount=actionableProgress.reduce((count,row) => count+(evaluationFor(row)?.reviewed_at ? 1 : 0),0);
  const everyParticipantPrepared=Boolean(pendingClass?.class_participants.every((participant) => sessions.some((session) => session.person_id===participant.person_id)));
  const dualReview=Boolean(pendingClass && sessions.length>pendingClass.class_participants.length);
  const canFinish=Boolean(
    pendingClass &&
    actionableProgress.length>0 &&
    everyParticipantPrepared &&
    reviewedCount===actionableProgress.length &&
    busy!=="prepare"
  );

  if (!pendingClass) return null;

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Evaluación posterior a la clase">
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p>Después de la clase</p>
          <h1>Revisión de evaluación</h1>
          <span>{dateLabel(pendingClass.scheduled_start_at)} · obligatoria antes del cierre pedagógico</span>
        </div>
        <div className={styles.headerScore}>
          <CheckCircle2/>
          <strong>{reviewedCount}/{actionableProgress.length}</strong>
          <small>revisadas</small>
        </div>
      </header>

      <div className={styles.notice}>
        <LockKeyhole/>
        <div>
          <strong>{dualReview ? "Revisión dual Bachata + Bachazouk" : "La evaluación la fija el profesor"}</strong>
          <span>{dualReview ? "Este alumno ya tiene ambos estilos evaluados para el mismo rol. CYA revisa solo lo pendiente y conserva el nivel independiente de cada uno." : "Responde cada pregunta con lo que observas. El contenido solo puede recomendar qué conviene revisar; nunca suma puntos."}</span>
        </div>
      </div>

      {busy==="prepare" ? <div className={styles.loading}><span/><p>Preparando las preguntas de la clase…</p></div> : null}

      {busy!=="prepare" ? <div className={styles.people}>{pendingClass.class_participants.map((participant) => {
        const rows=actionableProgress
          .filter((row) => row.person_id===participant.person_id)
          .sort((a,b) => styleLabel(a.style_term_id).localeCompare(styleLabel(b.style_term_id),"es") || aptitudeLabel(a.aptitude_term_id).localeCompare(aptitudeLabel(b.aptitude_term_id),"es"));
        if (!rows.length) return null;
        const reviewed=rows.filter((row) => Boolean(evaluationFor(row)?.reviewed_at)).length;
        const personStyles=[...new Set(rows.map((row) => styleLabel(row.style_term_id)))];
        return <article key={participant.person_id} className={styles.personCard}>
          <div className={styles.personHead}>
            <div><span>Alumno</span><h2>{personName(participant.person_id)}</h2>{personStyles.length>1 ? <small className={styles.personContexts}>{personStyles.join(" + ")}</small> : null}</div>
            <b>{reviewed}/{rows.length} revisadas</b>
          </div>
          <div className={styles.questionList}>{rows.map((row) => {
            const evaluation=evaluationFor(row);
            const customOptions=descriptorOptionsFor(row);
            const recommended=isRecommended(row);
            const currentValue=evaluation?.descriptor_id
              ? `d:${evaluation.descriptor_id}`
              : evaluation?.answer_scale_term_id
                ? `s:${evaluation.answer_scale_term_id}`
                : "";
            return <div className={`${styles.questionRow} ${evaluation?.reviewed_at ? styles.questionReviewed : ""}`} key={row.id}>
              <div className={styles.questionHead}>
                <div>
                  <span className={styles.styleChip}>{styleLabel(row.style_term_id)}</span>
                  <strong>{aptitudeLabel(row.aptitude_term_id)}</strong>
                  {recommended ? <span className={styles.recommended}><Sparkles/> Recomendado revisar por el contenido trabajado</span> : <span className={styles.standardReview}><CircleDot/> Revisión obligatoria</span>}
                </div>
                {evaluation?.reviewed_at ? <CheckCircle2 className={styles.reviewCheck}/> : null}
              </div>
              <label className={styles.answerField}>
                <span>Respuesta</span>
                <select value={currentValue} disabled={busy===`review-${row.id}`} onChange={(event) => void reviewAnswer(row,event.target.value)}>
                  <option value="">Selecciona lo que observas</option>
                  {customOptions.length ? customOptions.map((option) => <option key={option.id} value={`d:${option.id}`}>{option.label}</option>) : scaleTerms.map((option) => <option key={option.id} value={`s:${option.id}`}>{option.label}</option>)}
                </select>
              </label>
              {customOptions.length ? <small className={styles.customHint}>Usando descriptores configurados para esta aptitud.</small> : <small className={styles.customHint}>Usando la escala semántica base. Los números internos no se muestran.</small>}
            </div>;
          })}</div>
        </article>;
      })}</div> : null}

      {error ? <div className={styles.error}>{error}{isAdmin ? <Link href="/evaluation-settings"><Settings2/> Configurar evaluación</Link> : null}</div> : null}

      {reviewedCount===actionableProgress.length && actionableProgress.length>0 && busy!=="prepare" ? <div className={styles.ready}>
        <CheckCircle2/>
        <div><strong>Revisión completa</strong><span>Las respuestas del profesor quedan como estado real de esta evaluación. Ya puedes continuar al cierre pedagógico.</span></div>
      </div> : null}

      <footer className={styles.footer}>
        <span>Después de registrar la revisión, continúa el resumen pedagógico y el mensaje que verá el alumno.</span>
        <button type="button" disabled={!canFinish || busy==="finish"} onClick={() => void finish()}>{busy==="finish" ? "Guardando…" : `Registrar revisión (${reviewedCount}/${actionableProgress.length})`}</button>
      </footer>
    </section>
  </div>;
}