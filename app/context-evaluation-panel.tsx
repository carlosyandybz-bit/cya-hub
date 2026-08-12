"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ClipboardCheck, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./context-evaluation-panel.module.css";

type Term={id:number;taxonomy:string;term_key:string;label:string;metadata:Record<string,unknown>;sort_order:number};
type DanceProfile={id:number;style_term_id:number;role_term_id:number;level_term_id:number|null;is_primary:boolean;active:boolean};
type SessionRow={id:number;person_id:number;class_id:number|null;style_term_id:number;role_term_id:number;level_term_id:number;evaluation_kind:string;status:string;started_at:string;completed_at:string|null;created_at:string};
type EvaluationRow={id:number;session_id:number|null;aptitude_term_id:number;answer_scale_term_id:number|null;answer_label:string|null;reviewed_at:string|null};
type ProgressRow={id:number;aptitude_term_id:number};

type Props={
  client:SupabaseClient;
  personId:number;
  personName:string;
  classId?:number|null;
  styleTermId?:number|null;
  roleTermId?:number|null;
  levelTermId?:number|null;
  onCompleted?:()=>void|Promise<void>;
};

function dateLabel(value:string|null|undefined){
  if(!value)return "";
  return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));
}

function metadataAllows(term:Term,key:"styles"|"roles"|"levels",value:string){
  const raw=term.metadata?.[key];
  if(!raw)return true;
  if(Array.isArray(raw))return raw.map(String).includes(value);
  if(typeof raw==="object"&&raw!==null)return Boolean((raw as Record<string,unknown>)[value]);
  return true;
}

export function ContextEvaluationPanel({client,personId,personName,classId=null,styleTermId=null,roleTermId=null,levelTermId=null,onCompleted}:Props){
  const [terms,setTerms]=useState<Term[]>([]);
  const [profiles,setProfiles]=useState<DanceProfile[]>([]);
  const [profileId,setProfileId]=useState<number|null>(null);
  const [selectedLevelId,setSelectedLevelId]=useState<number|null>(levelTermId);
  const [baseline,setBaseline]=useState<SessionRow|null>(null);
  const [session,setSession]=useState<SessionRow|null>(null);
  const [evaluations,setEvaluations]=useState<EvaluationRow[]>([]);
  const [progress,setProgress]=useState<ProgressRow[]>([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  const explicit=Boolean(styleTermId&&roleTermId);

  useEffect(()=>{
    let cancelled=false;
    async function loadBase(){
      const [termResult,profileResult]=await Promise.all([
        client.from("catalog_terms").select("id,taxonomy,term_key,label,metadata,sort_order").in("taxonomy",["dance_style","dance_role","dance_level","aptitude","evaluation_scale"]).eq("active",true).order("sort_order"),
        explicit?Promise.resolve({data:[],error:null}):client.from("student_dance_profiles").select("id,style_term_id,role_term_id,level_term_id,is_primary,active").eq("person_id",personId).eq("active",true).order("is_primary",{ascending:false}),
      ]);
      if(cancelled)return;
      const firstError=termResult.error||profileResult.error;
      if(firstError){setError(firstError.message);return;}
      const nextTerms=(termResult.data??[]) as Term[];
      const nextProfiles=(profileResult.data??[]) as DanceProfile[];
      setTerms(nextTerms);
      setProfiles(nextProfiles);
      if(!explicit){
        const preferred=nextProfiles.find((item)=>item.is_primary)??nextProfiles[0]??null;
        setProfileId((current)=>current??preferred?.id??null);
        setSelectedLevelId((current)=>current??preferred?.level_term_id??null);
      }
    }
    void loadBase();
    return()=>{cancelled=true;};
  },[client,explicit,personId]);

  const selectedProfile=useMemo(()=>profiles.find((item)=>item.id===profileId)??profiles.find((item)=>item.is_primary)??profiles[0]??null,[profiles,profileId]);
  const activeStyleId=styleTermId??selectedProfile?.style_term_id??null;
  const activeRoleId=roleTermId??selectedProfile?.role_term_id??null;
  const activeLevelId=selectedLevelId??levelTermId??selectedProfile?.level_term_id??null;
  const styleKey=terms.find((term)=>term.id===activeStyleId)?.term_key??"";
  const roleKey=terms.find((term)=>term.id===activeRoleId)?.term_key??"";
  const levelKey=terms.find((term)=>term.id===activeLevelId)?.term_key??"";
  const labelFor=(id:number|null|undefined)=>terms.find((term)=>term.id===id)?.label??"Sin indicar";

  const loadContext=useCallback(async()=>{
    if(!activeStyleId||!activeRoleId)return;
    setError("");
    const [baselineResult,draftResult]=await Promise.all([
      client.rpc("get_evaluation_baseline_session",{p_person_id:personId,p_style_term_id:activeStyleId,p_role_term_id:activeRoleId}),
      client.from("evaluation_sessions").select("id,person_id,class_id,style_term_id,role_term_id,level_term_id,evaluation_kind,status,started_at,completed_at,created_at")
        .eq("person_id",personId).eq("style_term_id",activeStyleId).eq("role_term_id",activeRoleId).eq("status","draft")
        .in("evaluation_kind",["manual","reevaluation","initial"]).order("started_at",{ascending:true}).limit(1),
    ]);
    const firstError=baselineResult.error||draftResult.error;
    if(firstError){setError(firstError.message);return;}
    const nextBaseline=(baselineResult.data??null) as SessionRow|null;
    const nextSession=((draftResult.data??[]) as SessionRow[])[0]??null;
    setBaseline(nextBaseline);
    setSession(nextSession);
    if(nextSession)setSelectedLevelId(nextSession.level_term_id);
  },[activeRoleId,activeStyleId,client,personId]);

  useEffect(()=>{
    if(!activeStyleId||!activeRoleId)return;
    const timer=window.setTimeout(()=>void loadContext(),0);
    return()=>window.clearTimeout(timer);
  },[activeRoleId,activeStyleId,loadContext]);

  const loadSession=useCallback(async(target:SessionRow)=>{
    const [evaluationResult,progressResult]=await Promise.all([
      client.from("student_evaluations").select("id,session_id,aptitude_term_id,answer_scale_term_id,answer_label,reviewed_at").eq("session_id",target.id),
      client.from("student_aptitude_progress").select("id,aptitude_term_id").eq("person_id",target.person_id).eq("style_term_id",target.style_term_id).eq("role_term_id",target.role_term_id).eq("level_term_id",target.level_term_id),
    ]);
    const firstError=evaluationResult.error||progressResult.error;
    if(firstError){setError(firstError.message);return;}
    setEvaluations((evaluationResult.data??[]) as EvaluationRow[]);
    setProgress((progressResult.data??[]) as ProgressRow[]);
  },[client]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      if(!session){setEvaluations([]);setProgress([]);return;}
      void loadSession(session);
    },0);
    return()=>window.clearTimeout(timer);
  },[loadSession,session]);

  const scale=useMemo(()=>terms.filter((term)=>term.taxonomy==="evaluation_scale").map((term)=>({term,score:Number(term.metadata?.score)})).filter(({score})=>[0,25,50,75,100].includes(score)).sort((a,b)=>a.score-b.score),[terms]);
  const aptitudes=useMemo(()=>{
    const progressIds=new Set(progress.map((row)=>row.aptitude_term_id));
    return terms.filter((term)=>term.taxonomy==="aptitude"&&progressIds.has(term.id)&&metadataAllows(term,"styles",styleKey)&&metadataAllows(term,"roles",roleKey)&&metadataAllows(term,"levels",levelKey)).sort((a,b)=>a.sort_order-b.sort_order);
  },[levelKey,progress,roleKey,styleKey,terms]);
  const reviewedCount=aptitudes.filter((aptitude)=>evaluations.some((row)=>row.aptitude_term_id===aptitude.id&&Boolean(row.reviewed_at))).length;
  const isCompleteReady=aptitudes.length>0&&reviewedCount===aptitudes.length;

  async function start(){
    if(!activeStyleId||!activeRoleId||!activeLevelId){setError("Selecciona estilo, rol y nivel antes de evaluar.");return;}
    setBusy("start");setError("");
    const result=await client.rpc("start_context_evaluation",{
      p_person_id:personId,p_style_term_id:activeStyleId,p_role_term_id:activeRoleId,p_level_term_id:activeLevelId,
      p_class_id:classId??null,p_evaluation_kind:baseline?"reevaluation":"manual",
    });
    if(result.error){setError(result.error.message);setBusy("");return;}
    const next=result.data as SessionRow;
    setSession(next);setSelectedLevelId(next.level_term_id);await loadSession(next);setBusy("");
  }

  async function answer(aptitudeId:number,scaleId:number){
    if(!session)return;
    setBusy(`answer-${aptitudeId}`);setError("");
    const result=await client.rpc("review_context_evaluation_question",{p_session_id:session.id,p_aptitude_term_id:aptitudeId,p_scale_term_id:scaleId,p_note:null});
    if(result.error)setError(result.error.message);else await loadSession(session);
    setBusy("");
  }

  async function complete(){
    if(!session)return;
    setBusy("complete");setError("");
    const result=await client.rpc("complete_context_evaluation",{p_session_id:session.id});
    if(result.error){setError(result.error.message);setBusy("");return;}
    setSession(null);setEvaluations([]);setProgress([]);await loadContext();await onCompleted?.();setBusy("");
  }

  const canStart=Boolean(activeStyleId&&activeRoleId&&activeLevelId);
  return <section className={styles.panel} data-testid="context-evaluation-panel">
    <div className={styles.head}><div><span>Evaluación opcional</span><h2>Evaluación de {personName}</h2></div><div className={styles.status} data-ready={Boolean(baseline)}>{baseline?<><CheckCircle2 size={15}/> Referencia registrada</>:<><ClipboardCheck size={15}/> Sin referencia inicial</>}</div></div>

    {!explicit?<div className={styles.context}><label><span>Estilo y rol</span><select value={selectedProfile?.id??""} onChange={(event)=>{const next=profiles.find((item)=>item.id===Number(event.target.value))??null;setProfileId(next?.id??null);setSelectedLevelId(next?.level_term_id??null);setSession(null);}}><option value="">Selecciona contexto</option>{profiles.map((profile)=><option key={profile.id} value={profile.id}>{labelFor(profile.style_term_id)} · {labelFor(profile.role_term_id)}</option>)}</select></label><label><span>Nivel</span><select value={activeLevelId??""} onChange={(event)=>{setSelectedLevelId(event.target.value?Number(event.target.value):null);setSession(null);}}><option value="">Selecciona nivel</option>{terms.filter((term)=>term.taxonomy==="dance_level").map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div>:<div className={styles.meta}><span>{labelFor(activeStyleId)}</span><span>{labelFor(activeRoleId)}</span><span>{labelFor(activeLevelId)}</span></div>}

    <div className={styles.notice}>{baseline?<><strong>Primera referencia: {dateLabel(baseline.completed_at)}</strong><span>Es la primera evaluación completa válida de este estilo y rol, venga de una clase, una revisión posterior o una evaluación manual.</span></>:<><strong>Aún no hay baseline.</strong><span>No bloquea la clase ni el trabajo manual. La primera evaluación que completes será el punto de partida. Las recomendaciones automáticas solo usarán información cuando exista evidencia suficiente.</span></>}</div>

    {!session?<div className={styles.actions}><button type="button" className="btn" disabled={!canStart||busy==="start"} onClick={()=>void start()}><Play size={16}/>{busy==="start"?"Preparando…":baseline?"Nueva evaluación":"Empezar evaluación"}</button></div>:<>
      <div className={styles.progress}><strong>Evaluación en progreso · {reviewedCount}/{aptitudes.length}</strong><span>{labelFor(session.style_term_id)} · {labelFor(session.role_term_id)} · {labelFor(session.level_term_id)}</span></div>
      <div className={styles.questions}>{aptitudes.map((aptitude)=>{const current=evaluations.find((row)=>row.aptitude_term_id===aptitude.id);return <article className={styles.question} key={aptitude.id}><span>Parámetro</span><strong>{aptitude.label}</strong><div className={styles.scale}>{scale.map(({term,score})=><button type="button" key={term.id} disabled={busy===`answer-${aptitude.id}`} data-selected={current?.answer_scale_term_id===term.id} onClick={()=>void answer(aptitude.id,term.id)} aria-label={`${aptitude.label}: ${term.label}`}><b>{score}</b><small>{term.label}</small></button>)}</div></article>;})}</div>
      <div className={styles.actions}><button type="button" className="btn ghost" onClick={()=>void loadSession(session)}><RotateCcw size={15}/> Actualizar</button><button type="button" className="btn" disabled={!isCompleteReady||busy==="complete"} onClick={()=>void complete()}><CheckCircle2 size={16}/>{busy==="complete"?"Finalizando…":"Finalizar evaluación"}</button></div>
    </>}
    {error?<p className={styles.error}>{error}</p>:null}
  </section>;
}
