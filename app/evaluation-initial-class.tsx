"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, LockKeyhole, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./evaluation-initial-class.module.css";

type Participant={person_id:number;role_term_id:number|null;level_term_id:number|null};
type ActiveClass={id:number;style_term_id:number|null;started_at:string|null;scheduled_start_at:string;class_participants:Participant[]};
type CompletedContext={person_id:number;style_term_id:number;role_term_id:number;status:string};
type Candidate={classRow:ActiveClass;participant:Participant};
type SessionRow={id:number;person_id:number;class_id:number|null;style_term_id:number;role_term_id:number;level_term_id:number;evaluation_kind:string;status:string};
type ProgressRow={id:number;person_id:number;style_term_id:number;role_term_id:number;level_term_id:number;aptitude_term_id:number;effective_score:number};
type EvaluationRow={id:number;session_id:number|null;aptitude_term_id:number;answer_scale_term_id:number|null;descriptor_id:number|null;answer_label:string|null;reviewed_at:string|null};
type Milestone={id:number;style_term_id:number;role_term_id:number;level_term_id:number;aptitude_term_id:number;label:string;threshold_score:number};
type Descriptor={id:number;milestone_id:number;label:string;description:string|null;internal_score:number;sort_order:number};
type ScaleTerm={id:number;label:string;sort_order:number};
type Term={id:number;label:string;sort_order:number};
type Person={id:number;display_name:string};

const staffRoles=new Set(["admin","teacher_admin","teacher"]);

function dateLabel(value:string){return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}

export function InitialEvaluationClassGate(){
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [candidate,setCandidate]=useState<Candidate|null>(null);
  const [session,setSession]=useState<SessionRow|null>(null);
  const [progress,setProgress]=useState<ProgressRow[]>([]);
  const [evaluations,setEvaluations]=useState<EvaluationRow[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [descriptors,setDescriptors]=useState<Descriptor[]>([]);
  const [scaleTerms,setScaleTerms]=useState<ScaleTerm[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [person,setPerson]=useState<Person|null>(null);
  const [currentAptitudeId,setCurrentAptitudeId]=useState<number|null>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    let resolved=false;
    const inspect=async()=>{
      if(resolved)return;
      const runtime=getRuntimeSupabaseClient();
      if(!runtime)return;
      const auth=await runtime.auth.getSession();
      const userId=auth.data.session?.user.id;
      if(!userId||cancelled)return;
      const roleResult=await runtime.from("app_member_roles").select("role,active").eq("user_id",userId).eq("active",true);
      if(cancelled||roleResult.error)return;
      const roles=(roleResult.data??[]).map((row)=>String(row.role));
      if(!roles.some((role)=>staffRoles.has(role))){resolved=true;return;}
      resolved=true;
      setIsAdmin(roles.includes("admin")||roles.includes("teacher_admin"));
      setClient(runtime);
    };
    void inspect();
    const timer=window.setInterval(()=>void inspect(),1000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[]);

  const findCandidate=useCallback(async()=>{
    if(!client)return;
    const classResult=await client.from("classes")
      .select("id,style_term_id,started_at,scheduled_start_at,class_participants(person_id,role_term_id,level_term_id)")
      .eq("status","active")
      .not("started_at","is",null)
      .order("started_at",{ascending:true})
      .limit(10);
    if(classResult.error){setError(classResult.error.message);return;}
    const classes=(classResult.data??[]) as unknown as ActiveClass[];
    const personIds=[...new Set(classes.flatMap((item)=>item.class_participants.map((participant)=>participant.person_id)))];
    if(!personIds.length){setCandidate(null);return;}
    const completedResult=await client.from("evaluation_sessions")
      .select("person_id,style_term_id,role_term_id,status")
      .in("person_id",personIds)
      .eq("status","completed");
    if(completedResult.error){setError(completedResult.error.message);return;}
    const completed=(completedResult.data??[]) as CompletedContext[];
    for(const classRow of classes){
      if(!classRow.style_term_id)continue;
      for(const participant of classRow.class_participants){
        if(!participant.role_term_id||!participant.level_term_id)continue;
        const alreadyEvaluated=completed.some((row)=>row.person_id===participant.person_id&&row.style_term_id===classRow.style_term_id&&row.role_term_id===participant.role_term_id);
        if(!alreadyEvaluated){setCandidate({classRow,participant});return;}
      }
    }
    setCandidate(null);
  },[client]);

  useEffect(()=>{
    if(!client)return;
    const first=window.setTimeout(()=>void findCandidate(),0);
    const timer=window.setInterval(()=>void findCandidate(),4000);
    return()=>{window.clearTimeout(first);window.clearInterval(timer);};
  },[client,findCandidate]);

  const loadSession=useCallback(async(target:Candidate)=>{
    if(!client||!target.classRow.style_term_id||!target.participant.role_term_id||!target.participant.level_term_id)return;
    setBusy("prepare");setError("");
    const startResult=await client.rpc("start_initial_evaluation",{p_class_id:target.classRow.id,p_person_id:target.participant.person_id});
    if(startResult.error){setError(startResult.error.message);setBusy("");return;}
    const nextSession=startResult.data as SessionRow;
    setSession(nextSession);
    const [progressResult,evaluationResult,scaleResult,personResult]=await Promise.all([
      client.from("student_aptitude_progress").select("id,person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,effective_score").eq("person_id",target.participant.person_id).eq("style_term_id",target.classRow.style_term_id).eq("role_term_id",target.participant.role_term_id).eq("level_term_id",target.participant.level_term_id),
      client.from("student_evaluations").select("id,session_id,aptitude_term_id,answer_scale_term_id,descriptor_id,answer_label,reviewed_at").eq("session_id",nextSession.id),
      client.from("catalog_terms").select("id,label,sort_order").eq("taxonomy","evaluation_scale").eq("active",true).order("sort_order"),
      client.from("people").select("id,display_name").eq("id",target.participant.person_id).single(),
    ]);
    const baseError=progressResult.error||evaluationResult.error||scaleResult.error||personResult.error;
    if(baseError){setError(baseError.message);setBusy("");return;}
    const nextProgress=(progressResult.data??[]) as ProgressRow[];
    const aptitudeIds=nextProgress.map((row)=>row.aptitude_term_id);
    const [termResult,milestoneResult]=await Promise.all([
      aptitudeIds.length?client.from("catalog_terms").select("id,label,sort_order").in("id",aptitudeIds).order("sort_order"):Promise.resolve({data:[],error:null}),
      aptitudeIds.length?client.from("evaluation_milestones").select("id,style_term_id,role_term_id,level_term_id,aptitude_term_id,label,threshold_score").eq("style_term_id",target.classRow.style_term_id).eq("role_term_id",target.participant.role_term_id).eq("level_term_id",target.participant.level_term_id).in("aptitude_term_id",aptitudeIds).eq("active",true):Promise.resolve({data:[],error:null}),
    ]);
    const secondaryError=termResult.error||milestoneResult.error;
    if(secondaryError){setError(secondaryError.message);setBusy("");return;}
    const nextMilestones=(milestoneResult.data??[]) as Milestone[];
    const milestoneIds=nextMilestones.map((row)=>row.id);
    const descriptorResult=milestoneIds.length?await client.from("evaluation_descriptors").select("id,milestone_id,label,description,internal_score,sort_order").in("milestone_id",milestoneIds).eq("active",true).order("sort_order"):{data:[],error:null};
    if(descriptorResult.error){setError(descriptorResult.error.message);setBusy("");return;}
    const nextTerms=(termResult.data??[]) as Term[];
    const nextEvaluations=(evaluationResult.data??[]) as EvaluationRow[];
    setProgress(nextProgress);
    setEvaluations(nextEvaluations);
    setScaleTerms((scaleResult.data??[]) as ScaleTerm[]);
    setTerms(nextTerms);
    setMilestones(nextMilestones);
    setDescriptors((descriptorResult.data??[]) as Descriptor[]);
    setPerson(personResult.data as Person);
    const sorted=[...nextProgress].sort((a,b)=>(nextTerms.find((term)=>term.id===a.aptitude_term_id)?.sort_order??0)-(nextTerms.find((term)=>term.id===b.aptitude_term_id)?.sort_order??0));
    const firstUnreviewed=sorted.find((row)=>!nextEvaluations.find((evaluation)=>evaluation.aptitude_term_id===row.aptitude_term_id)?.reviewed_at);
    setCurrentAptitudeId((current)=>current&&sorted.some((row)=>row.aptitude_term_id===current)?current:(firstUnreviewed?.aptitude_term_id??sorted[0]?.aptitude_term_id??null));
    setBusy("");
  },[client]);

  useEffect(()=>{
    if(!candidate){setSession(null);setProgress([]);setEvaluations([]);setPerson(null);setCurrentAptitudeId(null);return;}
    const timer=window.setTimeout(()=>void loadSession(candidate),0);
    return()=>window.clearTimeout(timer);
  },[candidate,loadSession]);

  const sortedProgress=useMemo(()=>[...progress].sort((a,b)=>(terms.find((term)=>term.id===a.aptitude_term_id)?.sort_order??0)-(terms.find((term)=>term.id===b.aptitude_term_id)?.sort_order??0)),[progress,terms]);
  const currentIndex=Math.max(0,sortedProgress.findIndex((row)=>row.aptitude_term_id===currentAptitudeId));
  const current=sortedProgress[currentIndex]??null;
  const reviewedCount=sortedProgress.filter((row)=>Boolean(evaluations.find((evaluation)=>evaluation.aptitude_term_id===row.aptitude_term_id)?.reviewed_at)).length;
  const currentEvaluation=current?evaluations.find((evaluation)=>evaluation.aptitude_term_id===current.aptitude_term_id)??null:null;
  const aptitudeLabel=(id:number)=>terms.find((term)=>term.id===id)?.label??"Aptitud";
  const descriptorOptions=current?descriptors.filter((descriptor)=>milestones.some((milestone)=>milestone.id===descriptor.milestone_id&&milestone.aptitude_term_id===current.aptitude_term_id)).sort((a,b)=>a.internal_score-b.internal_score||a.sort_order-b.sort_order):[];
  const answerOptions=descriptorOptions.length?descriptorOptions.map((option)=>({value:`d:${option.id}`,label:option.label,description:option.description})):scaleTerms.map((option)=>({value:`s:${option.id}`,label:option.label,description:null}));
  const currentValue=currentEvaluation?.descriptor_id?`d:${currentEvaluation.descriptor_id}`:currentEvaluation?.answer_scale_term_id?`s:${currentEvaluation.answer_scale_term_id}`:"";

  async function answer(value:string){
    if(!client||!session||!current||!candidate)return;
    const descriptorId=value.startsWith("d:")?Number(value.slice(2)):null;
    const scaleId=value.startsWith("s:")?Number(value.slice(2)):null;
    if(!descriptorId&&!scaleId)return;
    setBusy("answer");setError("");
    const result=await client.rpc("review_evaluation_question",{p_session_id:session.id,p_progress_id:current.id,p_scale_term_id:scaleId,p_descriptor_id:descriptorId,p_note:null});
    if(result.error){setError(result.error.message);setBusy("");return;}
    await loadSession(candidate);
    const nextIndex=sortedProgress.findIndex((row,index)=>index>currentIndex&&!evaluations.find((evaluation)=>evaluation.aptitude_term_id===row.aptitude_term_id)?.reviewed_at);
    if(nextIndex>=0)setCurrentAptitudeId(sortedProgress[nextIndex].aptitude_term_id);
    setBusy("");
  }

  async function complete(){
    if(!client||!session)return;
    setBusy("complete");setError("");
    const result=await client.rpc("complete_initial_evaluation",{p_session_id:session.id});
    if(result.error){setError(result.error.message);setBusy("");return;}
    setSession(null);setCandidate(null);setProgress([]);setEvaluations([]);setCurrentAptitudeId(null);setBusy("");
    await findCandidate();
  }

  if(!candidate)return null;

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Evaluación inicial guiada">
    <section className={styles.panel}>
      <header className={styles.header}>
        <div><p>Durante la clase · diagnóstico inicial</p><h1>Evaluación inicial guiada</h1><span>{person?.display_name??"Alumno"} · clase iniciada {dateLabel(candidate.classRow.started_at??candidate.classRow.scheduled_start_at)}</span></div>
        <div className={styles.counter}><ClipboardCheck/><strong>{reviewedCount}/{sortedProgress.length}</strong><small>contestadas</small></div>
      </header>

      <div className={styles.notice}><LockKeyhole/><div><strong>Una pregunta cada vez</strong><span>Selecciona lo que observas. CYA guarda el valor interno sin pedirte números. Esta evaluación se completa antes de terminar la clase.</span></div></div>

      {busy==="prepare"?<div className={styles.loading}><span/><p>Preparando el diagnóstico…</p></div>:current?<>
        <div className={styles.progressBar}><i style={{width:`${sortedProgress.length?Math.round((reviewedCount/sortedProgress.length)*100):0}%`}}/></div>
        <section className={styles.question}>
          <div className={styles.questionMeta}><span>Pregunta {currentIndex+1} de {sortedProgress.length}</span>{currentEvaluation?.reviewed_at?<b><CheckCircle2/> Contestada</b>:null}</div>
          <h2>{aptitudeLabel(current.aptitude_term_id)}</h2>
          <p>¿Cuál de estas opciones describe mejor lo que observas ahora mismo?</p>
          <div className={styles.answers}>{answerOptions.map((option)=><button type="button" key={option.value} className={currentValue===option.value?styles.answerSelected:""} disabled={busy==="answer"} onClick={()=>void answer(option.value)}><strong>{option.label}</strong>{option.description?<span>{option.description}</span>:null}{currentValue===option.value?<CheckCircle2/>:null}</button>)}</div>
        </section>

        <div className={styles.navigation}><button type="button" className={styles.secondary} disabled={currentIndex<=0||busy==="answer"} onClick={()=>setCurrentAptitudeId(sortedProgress[currentIndex-1]?.aptitude_term_id??null)}><ArrowLeft/> Anterior</button><div className={styles.dots}>{sortedProgress.map((row,index)=>{const done=Boolean(evaluations.find((evaluation)=>evaluation.aptitude_term_id===row.aptitude_term_id)?.reviewed_at);return <button type="button" key={row.id} aria-label={`Pregunta ${index+1}`} className={`${done?styles.dotDone:""} ${index===currentIndex?styles.dotCurrent:""}`} onClick={()=>setCurrentAptitudeId(row.aptitude_term_id)}/>;})}</div><button type="button" className={styles.secondary} disabled={currentIndex>=sortedProgress.length-1||busy==="answer"} onClick={()=>setCurrentAptitudeId(sortedProgress[currentIndex+1]?.aptitude_term_id??null)}>Siguiente <ArrowRight/></button></div>
      </>:null}

      {error?<div className={styles.error}>{error}{isAdmin?<Link href="/evaluation-settings"><Settings2/> Configurar evaluación</Link>:null}</div>:null}

      <footer className={styles.footer}><span>La clase continuará con esta evaluación como línea base del alumno para este estilo y rol.</span><button type="button" disabled={!sortedProgress.length||reviewedCount!==sortedProgress.length||busy==="complete"} onClick={()=>void complete()}>{busy==="complete"?"Guardando…":"Completar evaluación inicial"}</button></footer>
    </section>
  </div>;
}
