"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Term={id:number;taxonomy:string;term_key:string;label:string;sort_order:number;active?:boolean};
type Milestone={id:number;style_term_id:number;role_term_id:number;level_term_id:number;aptitude_term_id:number;milestone_key:string;label:string;threshold_score:number;sort_order:number;active:boolean};
type Content={id:number;title:string;content_type:string;active:boolean};
type PointRule={id:number;content_id:number;style_term_id:number;role_term_id:number;level_term_id:number;aptitude_term_id:number;points:number;active:boolean};

type Props={client:SupabaseClient;terms:Term[];notify:(message:string)=>void};

function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"hito";}
function contentTypeLabel(value:string){return value==="correction"?"Corrección":value==="explanation"?"Explicación":value==="exercise"?"Ejercicio":value==="sequence"?"Secuencia":value;}

export function P0fEvaluationAdmin({client,terms,notify}:Props){
  const styles=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_style"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const roles=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_role"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const levels=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_level"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const aptitudes=useMemo(()=>terms.filter((term)=>term.taxonomy==="aptitude"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const [styleId,setStyleId]=useState<number|null>(null),[roleId,setRoleId]=useState<number|null>(null),[levelId,setLevelId]=useState<number|null>(null),[aptitudeId,setAptitudeId]=useState<number|null>(null);
  const [milestones,setMilestones]=useState<Milestone[]>([]),[contents,setContents]=useState<Content[]>([]),[pointRules,setPointRules]=useState<PointRule[]>([]);
  const [label,setLabel]=useState(""),[threshold,setThreshold]=useState(""),[busy,setBusy]=useState("");
  const [contentId,setContentId]=useState<number|null>(null),[points,setPoints]=useState("");

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      setStyleId((value)=>value??styles[0]?.id??null);setRoleId((value)=>value??roles[0]?.id??null);
      setLevelId((value)=>value??levels[0]?.id??null);setAptitudeId((value)=>value??aptitudes[0]?.id??null);
    },0);
    return()=>window.clearTimeout(timer);
  },[aptitudes,levels,roles,styles]);

  const load=useCallback(async()=>{
    const [milestoneResult,contentResult,pointsResult]=await Promise.all([
      client.from("evaluation_milestones").select("id,style_term_id,role_term_id,level_term_id,aptitude_term_id,milestone_key,label,threshold_score,sort_order,active").order("threshold_score"),
      client.from("teaching_contents").select("id,title,content_type,active").eq("active",true).order("content_type").order("title"),
      client.from("teaching_content_evaluation_points").select("id,content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,points,active").order("id"),
    ]);
    const error=milestoneResult.error||contentResult.error||pointsResult.error;
    if(error){notify(error.message);return;}
    setMilestones((milestoneResult.data??[]) as Milestone[]);setContents((contentResult.data??[]) as Content[]);setPointRules((pointsResult.data??[]) as PointRule[]);
    setContentId((value)=>value ?? (Number(contentResult.data?.[0]?.id||0) || null));
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  const filteredMilestones=milestones.filter((row)=>row.style_term_id===styleId&&row.role_term_id===roleId&&row.level_term_id===levelId&&row.aptitude_term_id===aptitudeId);
  const filteredRules=pointRules.filter((row)=>row.style_term_id===styleId&&row.role_term_id===roleId&&row.level_term_id===levelId&&row.aptitude_term_id===aptitudeId);

  async function addMilestone(){
    const score=Number(threshold);
    if(!styleId||!roleId||!levelId||!aptitudeId||!label.trim()||!Number.isInteger(score)||score<1||score>100){notify("Completa contexto, nombre y una puntuación de hito entre 1 y 100.");return;}
    setBusy("milestone");
    const user=await client.auth.getUser();
    const context=`${styleId}.${roleId}.${levelId}.${aptitudeId}`;
    const result=await client.from("evaluation_milestones").insert({style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,milestone_key:`${context}.${slug(label)}.${Date.now()}`,label:label.trim(),threshold_score:score,sort_order:score,active:true,created_by:user.data.user?.id??null});
    if(result.error)notify(result.error.message);else{setLabel("");setThreshold("");await load();notify("Hito creado.");}
    setBusy("");
  }

  async function removeMilestone(id:number){
    if(!window.confirm("¿Eliminar este hito? Si ya tiene historial, CYA impedirá una eliminación insegura."))return;
    setBusy(`milestone-${id}`);const result=await client.from("evaluation_milestones").delete().eq("id",id);
    if(result.error)notify(result.error.message);else{await load();notify("Hito eliminado.");}setBusy("");
  }

  async function addPointRule(){
    const value=Number(points);
    if(!contentId||!styleId||!roleId||!levelId||!aptitudeId||!Number.isInteger(value)||value<1||value>100){notify("Selecciona contenido y una subida de puntos entre 1 y 100.");return;}
    const duplicate=pointRules.find((row)=>row.content_id===contentId&&row.style_term_id===styleId&&row.role_term_id===roleId&&row.level_term_id===levelId&&row.aptitude_term_id===aptitudeId);
    setBusy("points");
    const user=await client.auth.getUser();
    const result=duplicate
      ? await client.from("teaching_content_evaluation_points").update({points:value,active:true,updated_at:new Date().toISOString()}).eq("id",duplicate.id)
      : await client.from("teaching_content_evaluation_points").insert({content_id:contentId,style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,points:value,active:true,created_by:user.data.user?.id??null});
    if(result.error)notify(result.error.message);else{setPoints("");await load();notify(duplicate?"Puntos actualizados.":"Relación de puntos creada.");}setBusy("");
  }

  async function removePointRule(id:number){setBusy(`rule-${id}`);const result=await client.from("teaching_content_evaluation_points").delete().eq("id",id);if(result.error)notify(result.error.message);else await load();setBusy("");}

  return <section className="admin-stack p0f-evaluation-admin">
    <header className="admin-section-head"><div><p className="eyebrow">Evaluación por hitos</p><h2>Hitos y progreso por contenido</h2><p>Los hitos describen el nivel real. Los puntos solo alimentan la gráfica y avisan cuándo conviene revisar el siguiente hito.</p></div></header>
    <article className="card pad"><div className="fields-2 p0f-context-grid"><label className="field"><span>Estilo</span><select value={styleId??""} onChange={(e)=>setStyleId(Number(e.target.value)||null)}>{styles.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Rol</span><select value={roleId??""} onChange={(e)=>setRoleId(Number(e.target.value)||null)}>{roles.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={levelId??""} onChange={(e)=>setLevelId(Number(e.target.value)||null)}>{levels.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Parámetro</span><select value={aptitudeId??""} onChange={(e)=>setAptitudeId(Number(e.target.value)||null)}>{aptitudes.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label></div></article>
    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Categorías pedagógicas</p><h2>Hitos del parámetro</h2></div><span className="badge">{filteredMilestones.length}</span></div>{filteredMilestones.length?<div className="p0f-admin-list">{filteredMilestones.map((row)=><div key={row.id}><span><strong>{row.label}</strong><small>Referencia {row.threshold_score} puntos</small></span><button type="button" className="icon-btn" aria-label={`Eliminar ${row.label}`} disabled={busy===`milestone-${row.id}`} onClick={()=>void removeMilestone(row.id)}><Trash2 size={16}/></button></div>)}</div>:<p className="modal-intro">Todavía no hay hitos en este contexto. CYA no inventará ninguno.</p>}<div className="fields-2 p0f-create-row"><label className="field"><span>Nombre del hito</span><input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Ej. Encuentra el 1 y el 5"/></label><label className="field"><span>Valor de referencia</span><input type="number" min={1} max={100} value={threshold} onChange={(e)=>setThreshold(e.target.value)} placeholder="40"/></label></div><button type="button" className="btn" disabled={busy==="milestone"} onClick={()=>void addMilestone()}><Plus size={16}/> Añadir hito</button></article>
    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Progreso automático</p><h2>Puntos aportados por contenido</h2></div><span className="badge">{filteredRules.length}</span></div><p className="modal-intro">Un contenido puede sumar puntos a este parámetro cuando se completa en una clase. El mismo contenido no se premia dos veces al mismo alumno en el mismo contexto.</p>{filteredRules.length?<div className="p0f-admin-list">{filteredRules.map((row)=>{const content=contents.find((item)=>item.id===row.content_id);return <div key={row.id}><span><strong>{content?.title||"Contenido"}</strong><small>{contentTypeLabel(content?.content_type||"")} · +{row.points} puntos</small></span><button type="button" className="icon-btn" aria-label="Eliminar relación de puntos" disabled={busy===`rule-${row.id}`} onClick={()=>void removePointRule(row.id)}><Trash2 size={16}/></button></div>;})}</div>:null}<div className="fields-2 p0f-create-row"><label className="field"><span>Contenido</span><select value={contentId??""} onChange={(e)=>setContentId(Number(e.target.value)||null)}>{contents.map((row)=><option key={row.id} value={row.id}>{contentTypeLabel(row.content_type)} · {row.title}</option>)}</select></label><label className="field"><span>Puntos al completarlo</span><input type="number" min={1} max={100} value={points} onChange={(e)=>setPoints(e.target.value)} placeholder="5"/></label></div><button type="button" className="btn" disabled={busy==="points"} onClick={()=>void addPointRule()}><Plus size={16}/> Guardar puntos</button></article>
  </section>;
}
