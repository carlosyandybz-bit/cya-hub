"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Award, BookOpenCheck, CalendarDays, CheckCircle2, CircleUserRound, Clock3, LockKeyhole, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./evaluation-history.module.css";

type Person = { id:number; display_name:string; active:boolean };
type StudentProfile = { person_id:number; active:boolean };
type Term = { id:number; taxonomy:string; label:string; sort_order:number };
type SessionRow = { id:number; person_id:number; class_id:number|null; style_term_id:number; role_term_id:number; level_term_id:number; evaluation_kind:string; status:string; note:string|null; started_at:string; completed_at:string|null; created_at:string };
type EvaluationRow = { id:number; session_id:number|null; class_id:number|null; style_term_id:number; role_term_id:number; level_term_id:number; aptitude_term_id:number; evaluation_kind:string; score:number; note:string|null; created_at:string };
type ProgressRow = { id:number; person_id:number; style_term_id:number; role_term_id:number; level_term_id:number; aptitude_term_id:number; raw_score:number; effective_score:number; pending_milestone_id:number|null; last_descriptor_id:number|null; updated_at:string };
type DecisionRow = { id:number; session_id:number; progress_id:number; milestone_id:number; class_id:number; decision:"accepted"|"rejected"; descriptor_id:number|null; note:string|null; created_at:string };
type Milestone = { id:number; aptitude_term_id:number; label:string; threshold_score:number; active:boolean };
type Descriptor = { id:number; milestone_id:number; label:string; description:string|null; internal_score:number; active:boolean };
type AwardRow = { id:number; class_id:number; person_id:number; content_id:number; style_term_id:number; role_term_id:number; level_term_id:number; aptitude_term_id:number; points:number; created_at:string };
type TeachingContent = { id:number; title:string; content_type:string };
type ClassRow = { id:number; scheduled_start_at:string; actual_duration_minutes:number|null; duration_minutes:number; class_type:string; location_text:string|null };

type ContextOption = { key:string; styleId:number; roleId:number; levelId:number };

type RadarItem = { id:number; label:string; value:number; previous:number|null };

const staffRoles = new Set(["admin","teacher_admin","teacher"]);
const kindLabels:Record<string,string>={initial:"Inicial",class:"Después de clase",manual:"Seguimiento histórico",reevaluation:"Reevaluación"};
const contentTypeLabels:Record<string,string>={correction:"Corrección",explanation:"Explicación",exercise:"Ejercicio",sequence:"Secuencia"};

function contextKey(styleId:number,roleId:number,levelId:number){return `${styleId}:${roleId}:${levelId}`;}
function parseContext(key:string):ContextOption|null{const parts=key.split(":").map(Number);return parts.length===3&&parts.every(Number.isFinite)?{key,styleId:parts[0],roleId:parts[1],levelId:parts[2]}:null;}
function dateLabel(value:string|null|undefined,withTime=true){if(!value)return "—";return new Intl.DateTimeFormat("es-ES",withTime?{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}:{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));}
function mean(values:number[]){return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;}
function bounded(value:number){return Math.max(0,Math.min(100,Number(value)||0));}

function RadarComparison({items,selectedId,onSelect}:{items:RadarItem[];selectedId:number|null;onSelect:(id:number)=>void}){
  if(items.length<3)return <div className={styles.radarEmpty}>Se necesitan al menos tres aptitudes en este contexto para dibujar el radar.</div>;
  const center=150,radius=104,count=items.length;
  const point=(index:number,ratio:number)=>{const angle=-Math.PI/2+(index*Math.PI*2)/count;return [center+Math.cos(angle)*radius*ratio,center+Math.sin(angle)*radius*ratio] as const;};
  const polygon=(ratio:number)=>items.map((_,index)=>point(index,ratio).join(",")).join(" ");
  const currentPolygon=items.map((item,index)=>point(index,bounded(item.value)/100).join(",")).join(" ");
  const previousPolygon=items.map((item,index)=>point(index,bounded(item.previous??0)/100).join(",")).join(" ");
  return <div className={styles.radarWrap}>
    <svg className={styles.radar} viewBox="0 0 300 300" role="img" aria-label="Comparación de la evaluación seleccionada con la anterior">
      {[.25,.5,.75,1].map((ratio)=><polygon key={ratio} className={styles.ring} points={polygon(ratio)}/>)}
      {items.map((item,index)=>{const [x,y]=point(index,1);return <line key={`axis-${item.id}`} className={styles.axis} x1={center} y1={center} x2={x} y2={y}/>;})}
      {items.some((item)=>item.previous!==null)?<polygon className={styles.previousArea} points={previousPolygon}/>:null}
      <polygon className={styles.currentArea} points={currentPolygon}/>
      {items.map((item,index)=>{const [x,y]=point(index,bounded(item.value)/100);const selected=item.id===selectedId;return <g key={item.id} role="button" tabIndex={0} className={styles.radarTarget} aria-label={`${item.label}: ${item.value}`} onClick={()=>onSelect(item.id)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(item.id);}}}><circle className={`${styles.radarHalo} ${selected?styles.radarHaloSelected:""}`} cx={x} cy={y} r={selected?12:9}/><circle className={styles.radarPoint} cx={x} cy={y} r={selected?5.5:4.5}/></g>;})}
    </svg>
    <div className={styles.radarLegend}>{items.map((item)=>{const delta=item.previous===null?null:item.value-item.previous;return <button type="button" key={item.id} className={item.id===selectedId?styles.legendSelected:""} onClick={()=>onSelect(item.id)}><span>{item.label}</span><strong>{item.value}</strong>{delta!==null?<small className={delta>0?styles.up:delta<0?styles.down:styles.flat}>{delta>0?`+${delta}`:delta}</small>:<small>—</small>}</button>;})}</div>
  </div>;
}

function TrendChart({points}:{points:{id:number;label:string;value:number;selected:boolean}[]}){
  if(points.length<2)return <div className={styles.trendEmpty}>Cuando haya al menos dos evaluaciones del parámetro aparecerá aquí su curva de evolución.</div>;
  const width=640,height=170,padX=24,padY=20;
  const x=(index:number)=>padX+(index*(width-padX*2))/Math.max(1,points.length-1);
  const y=(value:number)=>height-padY-(bounded(value)*(height-padY*2))/100;
  const path=points.map((point,index)=>`${index?"L":"M"}${x(index)} ${y(point.value)}`).join(" ");
  return <div className={styles.trendChart}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva histórica de la aptitud seleccionada">{[0,25,50,75,100].map((value)=><g key={value}><line className={styles.trendGrid} x1={padX} y1={y(value)} x2={width-padX} y2={y(value)}/><text className={styles.trendText} x={3} y={y(value)+4}>{value}</text></g>)}<path className={styles.trendPath} d={path}/>{points.map((point,index)=><circle key={point.id} className={point.selected?styles.trendSelected:styles.trendPoint} cx={x(index)} cy={y(point.value)} r={point.selected?6:4}/>)}</svg><div className={styles.trendLabels}><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div></div>;
}

export default function EvaluationHistoryClient(){
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [students,setStudents]=useState<Person[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [personId,setPersonId]=useState(0);
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [evaluations,setEvaluations]=useState<EvaluationRow[]>([]);
  const [progress,setProgress]=useState<ProgressRow[]>([]);
  const [decisions,setDecisions]=useState<DecisionRow[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [descriptors,setDescriptors]=useState<Descriptor[]>([]);
  const [awards,setAwards]=useState<AwardRow[]>([]);
  const [contents,setContents]=useState<TeachingContent[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [selectedContext,setSelectedContext]=useState("");
  const [selectedSessionId,setSelectedSessionId]=useState<number|null>(null);
  const [selectedAptitudeId,setSelectedAptitudeId]=useState<number|null>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    async function connect(){
      try{
        const response=await fetch("/api/runtime-config",{cache:"no-store",headers:{accept:"application/json"}});
        const config=await response.json().catch(()=>null) as {configured?:boolean;supabaseUrl?:string;supabasePublishableKey?:string}|null;
        if(!response.ok||!config?.configured||!config.supabaseUrl||!config.supabasePublishableKey)throw new Error("CYA Hub no ha podido conectar con sus datos.");
        const next=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        const auth=await next.auth.getSession();const userId=auth.data.session?.user.id;
        if(!userId){if(!cancelled)setAuthorized(false);return;}
        const roles=await next.from("app_member_roles").select("role,active").eq("user_id",userId).eq("active",true);
        if(roles.error)throw roles.error;
        const allowed=(roles.data??[]).some((row)=>staffRoles.has(String(row.role)));
        if(cancelled)return;setAuthorized(allowed);if(allowed)setClient(next);
      }catch(cause){if(!cancelled){setAuthorized(false);setError(cause instanceof Error?cause.message:"No se pudo abrir el histórico.");}}
    }
    void connect();return()=>{cancelled=true;};
  },[]);

  const loadBase=useCallback(async()=>{
    if(!client)return;setBusy("base");setError("");
    const [profileResult,peopleResult,termResult,milestoneResult,descriptorResult,contentResult]=await Promise.all([
      client.from("student_profiles").select("person_id,active").eq("active",true),
      client.from("people").select("id,display_name,active").eq("active",true).order("display_name"),
      client.from("catalog_terms").select("id,taxonomy,label,sort_order").in("taxonomy",["dance_style","dance_role","dance_level","aptitude"]).eq("active",true).order("sort_order"),
      client.from("evaluation_milestones").select("id,aptitude_term_id,label,threshold_score,active"),
      client.from("evaluation_descriptors").select("id,milestone_id,label,description,internal_score,active"),
      client.from("teaching_contents").select("id,title,content_type").eq("active",true).order("title"),
    ]);
    const firstError=profileResult.error||peopleResult.error||termResult.error||milestoneResult.error||descriptorResult.error||contentResult.error;
    if(firstError){setError(firstError.message);setBusy("");return;}
    const profileIds=new Set(((profileResult.data??[]) as StudentProfile[]).map((row)=>row.person_id));
    const nextStudents=((peopleResult.data??[]) as Person[]).filter((person)=>profileIds.has(person.id));
    setStudents(nextStudents);setTerms((termResult.data??[]) as Term[]);setMilestones((milestoneResult.data??[]) as Milestone[]);setDescriptors((descriptorResult.data??[]) as Descriptor[]);setContents((contentResult.data??[]) as TeachingContent[]);
    const requested=typeof window!=="undefined"?Number(new URLSearchParams(window.location.search).get("person")||0):0;
    const nextPerson=nextStudents.some((person)=>person.id===requested)?requested:(nextStudents[0]?.id??0);
    setPersonId((current)=>current||nextPerson);setBusy("");
  },[client]);

  useEffect(()=>{if(!client)return;const timer=window.setTimeout(()=>void loadBase(),0);return()=>window.clearTimeout(timer);},[client,loadBase]);

  const loadPerson=useCallback(async(id:number)=>{
    if(!client||!id)return;setBusy("person");setError("");
    const [sessionResult,evaluationResult,progressResult,awardResult]=await Promise.all([
      client.from("evaluation_sessions").select("id,person_id,class_id,style_term_id,role_term_id,level_term_id,evaluation_kind,status,note,started_at,completed_at,created_at").eq("person_id",id).eq("status","completed").order("completed_at",{ascending:true}),
      client.from("student_evaluations").select("id,session_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,created_at").eq("person_id",id).order("created_at",{ascending:true}),
      client.from("student_aptitude_progress").select("id,person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,raw_score,effective_score,pending_milestone_id,last_descriptor_id,updated_at").eq("person_id",id),
      client.from("evaluation_progress_awards").select("id,class_id,person_id,content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,points,created_at").eq("person_id",id).order("created_at",{ascending:true}),
    ]);
    const firstError=sessionResult.error||evaluationResult.error||progressResult.error||awardResult.error;
    if(firstError){setError(firstError.message);setBusy("");return;}
    const nextSessions=(sessionResult.data??[]) as SessionRow[], nextProgress=(progressResult.data??[]) as ProgressRow[], nextAwards=(awardResult.data??[]) as AwardRow[];
    const sessionIds=nextSessions.map((row)=>row.id), classIds=[...new Set([...nextSessions.map((row)=>row.class_id),...nextAwards.map((row)=>row.class_id)].filter((value):value is number=>Boolean(value)))];
    const decisionPromise=sessionIds.length?client.from("evaluation_milestone_decisions").select("id,session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,created_at").in("session_id",sessionIds).order("created_at",{ascending:true}):Promise.resolve({data:[],error:null});
    const classPromise=classIds.length?client.from("classes").select("id,scheduled_start_at,actual_duration_minutes,duration_minutes,class_type,location_text").in("id",classIds):Promise.resolve({data:[],error:null});
    const [decisionResult,classResult]=await Promise.all([decisionPromise,classPromise]);
    if(decisionResult.error||classResult.error){setError(decisionResult.error?.message||classResult.error?.message||"No se pudo completar el histórico.");setBusy("");return;}
    setSessions(nextSessions);setEvaluations((evaluationResult.data??[]) as EvaluationRow[]);setProgress(nextProgress);setAwards(nextAwards);setDecisions((decisionResult.data??[]) as DecisionRow[]);setClasses((classResult.data??[]) as ClassRow[]);
    const latest=nextSessions.at(-1);const context=latest?contextKey(latest.style_term_id,latest.role_term_id,latest.level_term_id):(nextProgress[0]?contextKey(nextProgress[0].style_term_id,nextProgress[0].role_term_id,nextProgress[0].level_term_id):"");
    setSelectedContext(context);setSelectedSessionId(latest?.id??null);const latestEvaluations=latest?((evaluationResult.data??[]) as EvaluationRow[]).filter((row)=>row.session_id===latest.id):[];setSelectedAptitudeId(latestEvaluations[0]?.aptitude_term_id??nextProgress[0]?.aptitude_term_id??null);setBusy("");
  },[client]);

  useEffect(()=>{if(!client||!personId)return;const timer=window.setTimeout(()=>void loadPerson(personId),0);return()=>window.clearTimeout(timer);},[client,personId,loadPerson]);

  const termLabel=(id:number)=>terms.find((term)=>term.id===id)?.label??"—";
  const contexts=useMemo(()=>{const map=new Map<string,ContextOption>();sessions.forEach((row)=>{const key=contextKey(row.style_term_id,row.role_term_id,row.level_term_id);map.set(key,{key,styleId:row.style_term_id,roleId:row.role_term_id,levelId:row.level_term_id});});progress.forEach((row)=>{const key=contextKey(row.style_term_id,row.role_term_id,row.level_term_id);if(!map.has(key))map.set(key,{key,styleId:row.style_term_id,roleId:row.role_term_id,levelId:row.level_term_id});});return [...map.values()];},[sessions,progress]);
  const context=parseContext(selectedContext)??contexts[0]??null;
  const contextSessions=useMemo(()=>context?sessions.filter((row)=>row.style_term_id===context.styleId&&row.role_term_id===context.roleId&&row.level_term_id===context.levelId):[],[sessions,context]);
  const selectedSession=contextSessions.find((row)=>row.id===selectedSessionId)??contextSessions.at(-1)??null;
  const selectedIndex=selectedSession?contextSessions.findIndex((row)=>row.id===selectedSession.id):-1;
  const previousSession=selectedIndex>0?contextSessions[selectedIndex-1]:null;
  const currentRows=selectedSession?evaluations.filter((row)=>row.session_id===selectedSession.id):[];
  const previousRows=previousSession?evaluations.filter((row)=>row.session_id===previousSession.id):[];
  const contextProgress=context?progress.filter((row)=>row.style_term_id===context.styleId&&row.role_term_id===context.roleId&&row.level_term_id===context.levelId):[];
  const aptitudeIds=useMemo(()=>{const ids=new Set<number>();currentRows.forEach((row)=>ids.add(row.aptitude_term_id));previousRows.forEach((row)=>ids.add(row.aptitude_term_id));contextProgress.forEach((row)=>ids.add(row.aptitude_term_id));return [...ids].sort((a,b)=>(terms.find((term)=>term.id===a)?.sort_order??0)-(terms.find((term)=>term.id===b)?.sort_order??0));},[currentRows,previousRows,contextProgress,terms]);
  const radarItems=aptitudeIds.map((aptitudeId)=>({id:aptitudeId,label:termLabel(aptitudeId),value:currentRows.find((row)=>row.aptitude_term_id===aptitudeId)?.score??contextProgress.find((row)=>row.aptitude_term_id===aptitudeId)?.effective_score??0,previous:previousRows.find((row)=>row.aptitude_term_id===aptitudeId)?.score??null}));
  const activeAptitudeId=selectedAptitudeId&&aptitudeIds.includes(selectedAptitudeId)?selectedAptitudeId:(aptitudeIds[0]??null);
  const currentAverage=mean(currentRows.map((row)=>row.score)),previousAverage=mean(previousRows.map((row)=>row.score));
  const averageDelta=currentAverage!==null&&previousAverage!==null?currentAverage-previousAverage:null;
  const student=students.find((row)=>row.id===personId)??null;
  const selectedClass=selectedSession?.class_id?classes.find((row)=>row.id===selectedSession.class_id)??null:null;
  const selectedDecisions=selectedSession?decisions.filter((row)=>row.session_id===selectedSession.id):[];
  const selectedAwards=selectedSession?.class_id?awards.filter((row)=>row.class_id===selectedSession.class_id&&(!context||(row.style_term_id===context.styleId&&row.role_term_id===context.roleId&&row.level_term_id===context.levelId))):[];
  const trendPoints=activeAptitudeId?contextSessions.map((session)=>{const row=evaluations.find((evaluation)=>evaluation.session_id===session.id&&evaluation.aptitude_term_id===activeAptitudeId);return row?{id:session.id,label:dateLabel(session.completed_at??session.created_at,false),value:row.score,selected:session.id===selectedSession?.id}:null;}).filter((row):row is {id:number;label:string;value:number;selected:boolean}=>Boolean(row)):[];
  const currentProgressForAptitude=activeAptitudeId?contextProgress.find((row)=>row.aptitude_term_id===activeAptitudeId)??null:null;
  const totalPointsForAptitude=activeAptitudeId?awards.filter((row)=>row.aptitude_term_id===activeAptitudeId&&(!context||(row.style_term_id===context.styleId&&row.role_term_id===context.roleId&&row.level_term_id===context.levelId))).reduce((sum,row)=>sum+row.points,0):0;

  function chooseContext(key:string){setSelectedContext(key);const parsed=parseContext(key);const matching=parsed?sessions.filter((row)=>row.style_term_id===parsed.styleId&&row.role_term_id===parsed.roleId&&row.level_term_id===parsed.levelId):[];const latest=matching.at(-1);setSelectedSessionId(latest?.id??null);const firstAptitude=latest?evaluations.find((row)=>row.session_id===latest.id)?.aptitude_term_id:null;setSelectedAptitudeId(firstAptitude??null);}
  function choosePerson(id:number){setPersonId(id);setSelectedContext("");setSelectedSessionId(null);setSelectedAptitudeId(null);}

  if(authorized===null)return <main className={styles.center}><span className={styles.spinner}/><p>Comprobando permisos…</p></main>;
  if(!authorized)return <main className={styles.center}><LockKeyhole/><h1>Evolución de evaluaciones</h1><p>Esta vista está reservada al equipo docente.</p><Link href="/">Volver a CYA Hub</Link>{error?<small>{error}</small>:null}</main>;

  return <main className={styles.page}>
    <header className={styles.top}><Link href="/" aria-label="Volver"><ArrowLeft/></Link><div><span>Alumnado · Evaluaciones</span><h1>Histórico y evolución</h1><p>Explora cualquier momento del aprendizaje y compara el radar con la evaluación inmediatamente anterior.</p></div><Link className={styles.settingsLink} href="/evaluation-settings">Configurar hitos</Link></header>

    <section className={styles.filters}><label><span>Alumno</span><select value={personId||""} onChange={(event)=>choosePerson(Number(event.target.value))}><option value="" disabled>Selecciona alumno</option>{students.map((person)=><option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label><label><span>Contexto</span><select value={context?.key??""} onChange={(event)=>chooseContext(event.target.value)} disabled={!contexts.length}>{contexts.length?contexts.map((item)=><option key={item.key} value={item.key}>{termLabel(item.styleId)} · {termLabel(item.roleId)} · {termLabel(item.levelId)}</option>):<option value="">Sin evaluaciones</option>}</select></label><div className={styles.identity}><CircleUserRound/><div><span>Alumno seleccionado</span><strong>{student?.display_name??"—"}</strong></div></div></section>

    {error?<div className={styles.error}>{error}</div>:null}
    {busy==="person"||busy==="base"?<div className={styles.loading}><span className={styles.spinner}/><p>Cargando evolución…</p></div>:null}

    {busy!=="person"&&busy!=="base"&&context?<>
      <section className={styles.summaryGrid}><article><TrendingUp/><span>Estado seleccionado</span><strong>{currentAverage===null?"—":`${currentAverage}/100`}</strong>{averageDelta!==null?<small className={averageDelta>0?styles.up:averageDelta<0?styles.down:styles.flat}>{averageDelta>0?`+${averageDelta}`:averageDelta} vs. anterior</small>:<small>Primera referencia</small>}</article><article><CalendarDays/><span>Evaluaciones</span><strong>{contextSessions.length}</strong><small>{termLabel(context.styleId)} · {termLabel(context.roleId)}</small></article><article><BookOpenCheck/><span>Puntos por contenido</span><strong>{awards.filter((row)=>row.style_term_id===context.styleId&&row.role_term_id===context.roleId&&row.level_term_id===context.levelId).reduce((sum,row)=>sum+row.points,0)}</strong><small>acumulados en este contexto</small></article><article><Award/><span>Hitos confirmados</span><strong>{decisions.filter((row)=>row.decision==="accepted"&&progress.some((progressRow)=>progressRow.id===row.progress_id&&progressRow.style_term_id===context.styleId&&progressRow.role_term_id===context.roleId&&progressRow.level_term_id===context.levelId)).length}</strong><small>{decisions.filter((row)=>row.decision==="rejected").length} revisiones negativas históricas</small></article></section>

      <section className={styles.timelineCard}><div className={styles.sectionHead}><div><span>Línea temporal</span><h2>Evaluaciones registradas</h2></div><b>{contextSessions.length}</b></div>{contextSessions.length?<div className={styles.timeline}>{contextSessions.map((session,index)=>{const rows=evaluations.filter((row)=>row.session_id===session.id);const previous=index>0?evaluations.filter((row)=>row.session_id===contextSessions[index-1].id):[];const avg=mean(rows.map((row)=>row.score));const prevAvg=mean(previous.map((row)=>row.score));const delta=avg!==null&&prevAvg!==null?avg-prevAvg:null;return <button type="button" key={session.id} className={session.id===selectedSession?.id?styles.timelineSelected:""} onClick={()=>setSelectedSessionId(session.id)}><span>{dateLabel(session.completed_at??session.created_at,false)}</span><strong>{avg===null?"—":avg}</strong><small>{kindLabels[session.evaluation_kind]??session.evaluation_kind}{delta!==null?` · ${delta>0?"+":""}${delta}`:""}</small></button>;})}</div>:<div className={styles.empty}>Todavía no hay evaluaciones completadas en este contexto.</div>}</section>

      <div className={styles.mainGrid}>
        <section className={styles.card}><div className={styles.sectionHead}><div><span>Radar histórico</span><h2>{selectedSession?dateLabel(selectedSession.completed_at??selectedSession.created_at,false):"Estado actual"}</h2></div>{previousSession?<div className={styles.compareKey}><i/><span>Anterior: {dateLabel(previousSession.completed_at??previousSession.created_at,false)}</span></div>:null}</div><RadarComparison items={radarItems} selectedId={activeAptitudeId} onSelect={setSelectedAptitudeId}/></section>

        <section className={styles.card}><div className={styles.sectionHead}><div><span>Parámetro</span><h2>{activeAptitudeId?termLabel(activeAptitudeId):"Selecciona una aptitud"}</h2></div>{currentProgressForAptitude?<b>{currentProgressForAptitude.effective_score}/100</b>:null}</div>{activeAptitudeId?<><div className={styles.aptitudeStats}><div><span>Valor en la fecha</span><strong>{currentRows.find((row)=>row.aptitude_term_id===activeAptitudeId)?.score??"—"}</strong></div><div><span>Progreso actual</span><strong>{currentProgressForAptitude?.effective_score??"—"}</strong></div><div><span>Progreso bruto</span><strong>{currentProgressForAptitude?.raw_score??"—"}</strong></div><div><span>Puntos de contenido</span><strong>+{totalPointsForAptitude}</strong></div></div><TrendChart points={trendPoints}/>{currentProgressForAptitude?.pending_milestone_id?<div className={styles.pendingMilestone}><Clock3/><div><span>Hito pendiente</span><strong>{milestones.find((item)=>item.id===currentProgressForAptitude.pending_milestone_id)?.label??"Pendiente de revisión"}</strong></div></div>:<div className={styles.okBox}><CheckCircle2/><span>Sin hitos pendientes en esta aptitud.</span></div>}</>:<div className={styles.empty}>No hay aptitudes disponibles.</div>}</section>
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.card}><div className={styles.sectionHead}><div><span>Clase / evaluación</span><h2>Qué ocurrió en este punto</h2></div></div>{selectedSession?<div className={styles.sessionMeta}><div><CalendarDays/><span>Fecha</span><strong>{selectedClass?dateLabel(selectedClass.scheduled_start_at):dateLabel(selectedSession.completed_at)}</strong></div><div><Clock3/><span>Duración</span><strong>{selectedClass?`${selectedClass.actual_duration_minutes??selectedClass.duration_minutes} min`:"Sin clase vinculada"}</strong></div><div><TrendingUp/><span>Tipo</span><strong>{kindLabels[selectedSession.evaluation_kind]??selectedSession.evaluation_kind}</strong></div></div>:<div className={styles.empty}>Selecciona una evaluación.</div>}
          {selectedAwards.length?<div className={styles.eventList}><h3>Progreso por contenido</h3>{selectedAwards.map((award)=><article key={award.id}><BookOpenCheck/><div><strong>{contents.find((item)=>item.id===award.content_id)?.title??"Contenido"}</strong><span>{contentTypeLabels[contents.find((item)=>item.id===award.content_id)?.content_type??""]??"Contenido"} · {termLabel(award.aptitude_term_id)}</span></div><b>+{award.points}</b></article>)}</div>:null}
        </section>

        <section className={styles.card}><div className={styles.sectionHead}><div><span>Hitos</span><h2>Decisiones docentes</h2></div><b>{selectedDecisions.length}</b></div>{selectedDecisions.length?<div className={styles.decisionList}>{selectedDecisions.map((decision)=>{const milestone=milestones.find((item)=>item.id===decision.milestone_id);const descriptor=descriptors.find((item)=>item.id===decision.descriptor_id);return <article key={decision.id} className={decision.decision==="accepted"?styles.accepted:styles.rejected}>{decision.decision==="accepted"?<CheckCircle2/>:<XCircle/>}<div><span>{decision.decision==="accepted"?"Hito demostrado":"Todavía no demostrado"}</span><strong>{milestone?.label??"Hito"}</strong>{descriptor?<small>{descriptor.label}{descriptor.description?` · ${descriptor.description}`:""}</small>:null}{decision.note?<p>{decision.note}</p>:null}</div><b>{milestone?.threshold_score??"—"}</b></article>;})}</div>:<div className={styles.empty}>En esta evaluación no hubo ningún hito que requiriera decisión.</div>}</section>
      </div>

      <section className={styles.progressCard}><div className={styles.sectionHead}><div><span>Estado actual</span><h2>Todas las aptitudes del contexto</h2></div><b>{contextProgress.length}</b></div>{contextProgress.length?<div className={styles.progressGrid}>{contextProgress.map((row)=>{const pending=milestones.find((item)=>item.id===row.pending_milestone_id);return <button type="button" key={row.id} className={row.aptitude_term_id===activeAptitudeId?styles.progressSelected:""} onClick={()=>setSelectedAptitudeId(row.aptitude_term_id)}><div><strong>{termLabel(row.aptitude_term_id)}</strong><span>{pending?`Bloqueado en hito: ${pending.label}`:"Progreso disponible"}</span></div><b>{row.effective_score}</b><div className={styles.miniTrack}><i style={{width:`${bounded(row.effective_score)}%`}}/></div>{row.raw_score!==row.effective_score?<small>Bruto {row.raw_score} · pendiente de confirmación</small>:<small>Actualizado {dateLabel(row.updated_at,false)}</small>}</button>;})}</div>:<div className={styles.empty}>El nuevo motor todavía no ha generado progreso para este contexto.</div>}</section>
    </>:busy!=="person"&&busy!=="base"?<section className={styles.noData}><TrendingUp/><h2>Sin histórico de evaluación</h2><p>Cuando este alumno tenga una evaluación completada, aparecerá aquí su línea temporal y la comparación del radar.</p></section>:null}
  </main>;
}
