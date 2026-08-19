"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EvaluationTrendSettings } from "../evaluation-trend-settings";
import styles from "./evaluation-settings.module.css";

type Term = { id:number; taxonomy:string; term_key:string; label:string; sort_order:number; active:boolean };
type Content = { id:number; title:string; content_type:string; active:boolean; completion_status:string; publication_status:string };
type Milestone = { id:number; style_term_id:number; role_term_id:number; level_term_id:number; aptitude_term_id:number; milestone_key:string; label:string; threshold_score:number; sort_order:number; active:boolean };
type Descriptor = { id:number; milestone_id:number; descriptor_key:string; label:string; description:string|null; internal_score:number; sort_order:number; active:boolean };
type RecommendationMap = { id:number; content_id:number; style_term_id:number; role_term_id:number; level_term_id:number; aptitude_term_id:number; active:boolean };

const contentTypeLabels:Record<string,string>={correction:"Corrección",explanation:"Explicación",exercise:"Ejercicio",sequence:"Secuencia"};

function slug(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "hito";
}

function integerFormValue(form:FormData,name:string,min:number,max:number) {
  const raw=String(form.get(name) ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const value=Number(raw);
  return Number.isInteger(value) && value>=min && value<=max ? value : null;
}

export default function EvaluationSettingsClient() {
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [terms,setTerms]=useState<Term[]>([]);
  const [contents,setContents]=useState<Content[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [descriptors,setDescriptors]=useState<Descriptor[]>([]);
  const [recommendationMaps,setRecommendationMaps]=useState<RecommendationMap[]>([]);
  const [styleId,setStyleId]=useState(0), [roleId,setRoleId]=useState(0), [levelId,setLevelId]=useState(0), [aptitudeId,setAptitudeId]=useState(0);
  const [busy,setBusy]=useState(""), [error,setError]=useState(""), [notice,setNotice]=useState("");

  useEffect(() => {
    let cancelled=false;
    async function connect() {
      try {
        const response=await fetch("/api/runtime-config",{cache:"no-store",headers:{accept:"application/json"}});
        const config=await response.json().catch(() => null) as {configured?:boolean;supabaseUrl?:string;supabasePublishableKey?:string}|null;
        if (!response.ok || !config?.configured || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error("CYA Hub no ha podido conectar con sus datos.");
        const next=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        const sessionResult=await next.auth.getSession();
        const userId=sessionResult.data.session?.user.id;
        if (!userId) { if (!cancelled) setAuthorized(false); return; }
        const roles=await next.from("app_member_roles").select("role,active").eq("user_id",userId).eq("active",true);
        if (roles.error) throw roles.error;
        const canAdmin=(roles.data ?? []).some((row) => ["admin","teacher_admin"].includes(String(row.role)));
        if (cancelled) return;
        setAuthorized(canAdmin);
        if (canAdmin) setClient(next);
      } catch (cause) {
        if (!cancelled) { setAuthorized(false); setError(cause instanceof Error?cause.message:"No se pudo abrir la configuración."); }
      }
    }
    void connect();
    return () => { cancelled=true; };
  },[]);

  const load=useCallback(async () => {
    if (!client) return;
    setBusy("load"); setError("");
    const [termResult,contentResult,milestoneResult,descriptorResult,mapResult]=await Promise.all([
      client.from("catalog_terms").select("id,taxonomy,term_key,label,sort_order,active").in("taxonomy",["dance_style","dance_role","dance_level","aptitude"]).eq("active",true).order("sort_order"),
      client.from("teaching_contents").select("id,title,content_type,active,completion_status,publication_status").eq("active",true).order("title"),
      client.from("evaluation_milestones").select("id,style_term_id,role_term_id,level_term_id,aptitude_term_id,milestone_key,label,threshold_score,sort_order,active").order("threshold_score"),
      client.from("evaluation_descriptors").select("id,milestone_id,descriptor_key,label,description,internal_score,sort_order,active").order("sort_order"),
      client.from("teaching_content_evaluation_recommendations").select("id,content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,active").order("id"),
    ]);
    const firstError=termResult.error || contentResult.error || milestoneResult.error || descriptorResult.error || mapResult.error;
    if (firstError) { setError(firstError.message); setBusy(""); return; }
    const nextTerms=(termResult.data ?? []) as Term[];
    setTerms(nextTerms);
    setContents((contentResult.data ?? []) as Content[]);
    setMilestones((milestoneResult.data ?? []) as Milestone[]);
    setDescriptors((descriptorResult.data ?? []) as Descriptor[]);
    setRecommendationMaps((mapResult.data ?? []) as RecommendationMap[]);
    const first=(taxonomy:string) => nextTerms.find((term) => term.taxonomy===taxonomy)?.id ?? 0;
    setStyleId((current) => current || first("dance_style"));
    setRoleId((current) => current || first("dance_role"));
    setLevelId((current) => current || first("dance_level"));
    setAptitudeId((current) => current || first("aptitude"));
    setBusy("");
  },[client]);

  useEffect(() => {
    if (!client) return;
    const timer=window.setTimeout(() => void load(),0);
    return () => window.clearTimeout(timer);
  },[client,load]);

  const stylesList=terms.filter((term) => term.taxonomy==="dance_style"), rolesList=terms.filter((term) => term.taxonomy==="dance_role"), levelsList=terms.filter((term) => term.taxonomy==="dance_level"), aptitudes=terms.filter((term) => term.taxonomy==="aptitude");
  const currentMilestones=useMemo(() => milestones.filter((row) => row.style_term_id===styleId && row.role_term_id===roleId && row.level_term_id===levelId && row.aptitude_term_id===aptitudeId).sort((a,b) => a.threshold_score-b.threshold_score),[milestones,styleId,roleId,levelId,aptitudeId]);
  const currentRecommendations=useMemo(() => recommendationMaps.filter((row) => row.style_term_id===styleId && row.role_term_id===roleId && row.level_term_id===levelId && row.aptitude_term_id===aptitudeId && row.active),[recommendationMaps,styleId,roleId,levelId,aptitudeId]);
  const label=(id:number) => terms.find((term) => term.id===id)?.label ?? "—";
  const contentFor=(id:number) => contents.find((content) => content.id===id) ?? null;

  async function createMilestone(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !styleId || !roleId || !levelId || !aptitudeId) return;
    const form=new FormData(event.currentTarget), name=String(form.get("label")||"").trim(), threshold=integerFormValue(form,"threshold",1,100);
    if (!name || threshold===null) return setError("Indica un nombre y un umbral interno entre 1 y 100.");
    setBusy("milestone-new"); setError(""); setNotice("");
    const result=await client.from("evaluation_milestones").insert({style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,milestone_key:`${slug(name)}-${threshold}`,label:name,threshold_score:threshold,sort_order:threshold,active:true});
    if (result.error) setError(result.error.message); else { event.currentTarget.reset(); setNotice("Hito añadido."); await load(); }
    setBusy("");
  }

  async function updateMilestone(event:FormEvent<HTMLFormElement>,row:Milestone) {
    event.preventDefault(); if (!client) return;
    const form=new FormData(event.currentTarget), name=String(form.get("label")||"").trim(), threshold=integerFormValue(form,"threshold",1,100);
    if (!name || threshold===null) return setError("El umbral interno debe estar entre 1 y 100.");
    setBusy(`milestone-${row.id}`); setError(""); setNotice("");
    const result=await client.from("evaluation_milestones").update({label:name,threshold_score:threshold,sort_order:threshold,milestone_key:`${slug(name)}-${threshold}`}).eq("id",row.id);
    if (result.error) setError(result.error.message); else { setNotice("Hito actualizado."); await load(); }
    setBusy("");
  }

  async function archiveMilestone(row:Milestone) {
    if (!client || !window.confirm(`¿Desactivar el hito “${row.label}”?`)) return;
    setBusy(`archive-${row.id}`); setError("");
    const result=await client.from("evaluation_milestones").update({active:false}).eq("id",row.id);
    if (result.error) setError(result.error.message); else { setNotice("Hito desactivado."); await load(); }
    setBusy("");
  }

  async function createDescriptor(event:FormEvent<HTMLFormElement>,milestone:Milestone) {
    event.preventDefault(); if (!client) return;
    const form=new FormData(event.currentTarget), name=String(form.get("label")||"").trim(), description=String(form.get("description")||"").trim(), score=integerFormValue(form,"score",0,100);
    if (!name || score===null) return setError("El descriptor necesita un nombre y un valor interno entre 0 y 100.");
    setBusy(`descriptor-new-${milestone.id}`); setError(""); setNotice("");
    const existing=descriptors.filter((row) => row.milestone_id===milestone.id).length;
    const result=await client.from("evaluation_descriptors").insert({milestone_id:milestone.id,descriptor_key:`${slug(name)}-${score}-${existing+1}`,label:name,description:description||null,internal_score:score,sort_order:existing,active:true});
    if (result.error) setError(result.error.message); else { event.currentTarget.reset(); setNotice("Descriptor añadido."); await load(); }
    setBusy("");
  }

  async function updateDescriptor(event:FormEvent<HTMLFormElement>,row:Descriptor) {
    event.preventDefault(); if (!client) return;
    const form=new FormData(event.currentTarget), name=String(form.get("label")||"").trim(), description=String(form.get("description")||"").trim(), score=integerFormValue(form,"score",0,100);
    if (!name || score===null) return setError("El valor interno debe estar entre 0 y 100.");
    setBusy(`descriptor-${row.id}`); setError(""); setNotice("");
    const result=await client.from("evaluation_descriptors").update({label:name,description:description||null,internal_score:score,descriptor_key:`${slug(name)}-${score}-${row.id}`}).eq("id",row.id);
    if (result.error) setError(result.error.message); else { setNotice("Descriptor actualizado."); await load(); }
    setBusy("");
  }

  async function archiveDescriptor(row:Descriptor) {
    if (!client) return;
    setBusy(`descriptor-archive-${row.id}`); setError("");
    const result=await client.from("evaluation_descriptors").update({active:false}).eq("id",row.id);
    if (result.error) setError(result.error.message); else { setNotice("Descriptor desactivado."); await load(); }
    setBusy("");
  }

  async function saveRecommendation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    const form=new FormData(event.currentTarget), contentId=Number(form.get("content_id"));
    if (!contentId) return setError("Selecciona el contenido que debe recomendar revisar esta aptitud.");
    setBusy("recommendation"); setError(""); setNotice("");
    const result=await client.from("teaching_content_evaluation_recommendations").upsert({content_id:contentId,style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,active:true},{onConflict:"content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id"});
    if (result.error) setError(result.error.message); else { event.currentTarget.reset(); setNotice("Recomendación guardada. El contenido no modifica la puntuación."); await load(); }
    setBusy("");
  }

  async function removeRecommendation(row:RecommendationMap) {
    if (!client) return;
    setBusy(`recommendation-${row.id}`); setError("");
    const result=await client.from("teaching_content_evaluation_recommendations").delete().eq("id",row.id);
    if (result.error) setError(result.error.message); else { setNotice("Recomendación eliminada."); await load(); }
    setBusy("");
  }

  if (authorized===null) return <main className={styles.center}><span className={styles.spinner}/><p>Comprobando permisos…</p></main>;
  if (!authorized) return <main className={styles.center}><Settings2/><h1>Configuración de evaluación</h1><p>Esta pantalla requiere permisos de administración.</p><Link href="/">Volver a CYA Hub</Link>{error?<small>{error}</small>:null}</main>;

  return <main className={styles.page}>
    <header className={styles.top}><Link href="/" aria-label="Volver"><ArrowLeft/></Link><div><span>Administración · Enseñanza</span><h1>Evaluación y progreso</h1><p>Configura hitos y respuestas observables. El profesor fija la evaluación; el contenido únicamente puede recomendar qué conviene revisar.</p></div></header>

    <EvaluationTrendSettings client={client!} />

    <section className={styles.contextCard}><div><strong>Contexto pedagógico</strong><span>Hitos, descriptores y recomendaciones se definen por estilo, rol, nivel y aptitud.</span></div><div className={styles.contextGrid}><label><span>Estilo</span><select value={styleId} onChange={(event)=>setStyleId(Number(event.target.value))}>{stylesList.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label><span>Rol</span><select value={roleId} onChange={(event)=>setRoleId(Number(event.target.value))}>{rolesList.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label><span>Nivel</span><select value={levelId} onChange={(event)=>setLevelId(Number(event.target.value))}>{levelsList.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label><span>Aptitud</span><select value={aptitudeId} onChange={(event)=>setAptitudeId(Number(event.target.value))}>{aptitudes.map((term)=><option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div></section>

    {error?<div className={styles.error}>{error}</div>:null}{notice?<div className={styles.notice}><CheckCircle2/>{notice}</div>:null}

    <div className={styles.columns}>
      <section className={styles.card}>
        <div className={styles.cardHead}><div><span>1 · Hitos y respuestas</span><h2>{label(aptitudeId)}</h2></div><b>{currentMilestones.filter((row)=>row.active).length}</b></div>
        <p className={styles.help}>Los números son internos de Administración. Durante la evaluación el profesor ve únicamente las respuestas observables.</p>
        <form className={styles.addForm} onSubmit={createMilestone}><input name="label" placeholder="Ej. Mantiene la base con autonomía" required/><input name="threshold" type="text" inputMode="numeric" pattern="[0-9]*" min="1" max="100" placeholder="Umbral" required/><button disabled={busy==="milestone-new"}><Plus/> Añadir hito</button></form>
        <div className={styles.stack}>{currentMilestones.map((milestone)=><article className={`${styles.item} ${!milestone.active?styles.inactive:""}`} key={milestone.id}><details><summary><div><strong>{milestone.label}</strong><span>Umbral interno {milestone.threshold_score}/100</span></div><b>{descriptors.filter((row)=>row.milestone_id===milestone.id && row.active).length} respuestas</b></summary><div className={styles.detail}>
          <form className={styles.editGrid} onSubmit={(event)=>void updateMilestone(event,milestone)}><label><span>Nombre del hito</span><input name="label" defaultValue={milestone.label}/></label><label><span>Umbral interno</span><input name="threshold" type="text" inputMode="numeric" pattern="[0-9]*" min="1" max="100" defaultValue={milestone.threshold_score}/></label><button disabled={busy===`milestone-${milestone.id}`}>Guardar cambios</button><button type="button" className={styles.danger} onClick={()=>void archiveMilestone(milestone)} disabled={!milestone.active}><Trash2/> Desactivar</button></form>
          <div className={styles.subsection}><div><strong>Respuestas observables</strong><span>Son las opciones que verá el profesor. Cada respuesta fija su valor interno sin pedir números.</span></div>{descriptors.filter((row)=>row.milestone_id===milestone.id).map((descriptor)=><form key={descriptor.id} className={`${styles.descriptor} ${!descriptor.active?styles.inactive:""}`} onSubmit={(event)=>void updateDescriptor(event,descriptor)}><input name="label" defaultValue={descriptor.label}/><input name="description" defaultValue={descriptor.description ?? ""} placeholder="Qué se observa"/><label><span>Valor interno</span><input name="score" type="text" inputMode="numeric" pattern="[0-9]*" min="0" max="100" defaultValue={descriptor.internal_score}/></label><button disabled={busy===`descriptor-${descriptor.id}`}>Guardar</button><button type="button" className={styles.iconDanger} onClick={()=>void archiveDescriptor(descriptor)} disabled={!descriptor.active}><Trash2/></button></form>)}
          <form className={styles.descriptorAdd} onSubmit={(event)=>void createDescriptor(event,milestone)}><input name="label" placeholder="Respuesta observable" required/><input name="description" placeholder="Descripción breve"/><input name="score" type="text" inputMode="numeric" pattern="[0-9]*" min="0" max="100" placeholder="Valor interno" required/><button disabled={busy===`descriptor-new-${milestone.id}`}><Plus/> Añadir respuesta</button></form></div>
        </div></details></article>)}</div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}><div><span>2 · Recomendaciones de reevaluación</span><h2>Contenido → pregunta</h2></div><b>{currentRecommendations.length}</b></div>
        <p className={styles.help}>Si se trabaja uno de estos contenidos, CYA destacará esta aptitud en la revisión posterior. <strong>No suma ni resta puntuación.</strong></p>
        <form className={styles.recommendationForm} onSubmit={saveRecommendation}>
          <label><span>Contenido que activa la recomendación</span><select name="content_id" required defaultValue=""><option value="" disabled>Seleccionar contenido</option>{contents.map((content)=><option value={content.id} key={content.id}>{content.title} · {contentTypeLabels[content.content_type]??content.content_type}</option>)}</select></label>
          <button disabled={busy==="recommendation"}><Sparkles/> Recomendar revisar</button>
        </form>
        <div className={styles.mapList}>{currentRecommendations.length?currentRecommendations.map((row)=>{const content=contentFor(row.content_id);return <article key={row.id}><div><strong>{content?.title??"Contenido archivado"}</strong><span>{content?contentTypeLabels[content.content_type]??content.content_type:"Contenido"} · recomienda revisar {label(row.aptitude_term_id)}</span></div><b className={styles.recommendationBadge}>Revisar</b><button className={styles.iconDanger} type="button" onClick={()=>void removeRecommendation(row)} disabled={busy===`recommendation-${row.id}`}><Trash2/></button></article>;}):<div className={styles.empty}>Aún no hay contenido que recomiende revisar esta aptitud. La pregunta seguirá siendo obligatoria tras la clase.</div>}</div>
      </section>
    </div>

    <section className={styles.ruleBox}><strong>Regla activa</strong><p>La evaluación se fija con respuestas del profesor. El contenido puede recomendar una reevaluación, pero nunca modifica por sí mismo el valor de una aptitud. Los hitos y valores internos solo sirven para interpretar esas respuestas de forma consistente.</p></section>
  </main>;
}
