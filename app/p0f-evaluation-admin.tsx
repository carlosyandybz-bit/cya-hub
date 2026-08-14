"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Term={id:number;taxonomy:string;term_key:string;label:string;sort_order:number;active?:boolean};
type Milestone={id:number;style_term_id:number;role_term_id:number;level_term_id:number;aptitude_term_id:number;milestone_key:string;label:string;threshold_score:number;sort_order:number;active:boolean};
type Props={client:SupabaseClient;terms:Term[];notify:(message:string)=>void};

function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"hito";}
function boundedScoreText(value:string){const clean=value.replace(/\D/g,"").slice(0,3);if(!clean)return "";return String(Math.min(100,Number(clean)));}

export function P0fEvaluationAdmin({client,terms,notify}:Props){
  const styles=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_style"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const roles=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_role"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const levels=useMemo(()=>terms.filter((term)=>term.taxonomy==="dance_level"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const aptitudes=useMemo(()=>terms.filter((term)=>term.taxonomy==="aptitude"&&term.active!==false).sort((a,b)=>a.sort_order-b.sort_order),[terms]);
  const [styleId,setStyleId]=useState<number|null>(null),[roleId,setRoleId]=useState<number|null>(null),[levelId,setLevelId]=useState<number|null>(null),[aptitudeId,setAptitudeId]=useState<number|null>(null);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [label,setLabel]=useState(""),[threshold,setThreshold]=useState(""),[busy,setBusy]=useState("");
  const [editingMilestoneId,setEditingMilestoneId]=useState<number|null>(null),[editLabel,setEditLabel]=useState(""),[editThreshold,setEditThreshold]=useState("");

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      setStyleId((value)=>value??styles[0]?.id??null);setRoleId((value)=>value??roles[0]?.id??null);
      setLevelId((value)=>value??levels[0]?.id??null);setAptitudeId((value)=>value??aptitudes[0]?.id??null);
    },0);
    return()=>window.clearTimeout(timer);
  },[aptitudes,levels,roles,styles]);

  const load=useCallback(async()=>{
    const result=await client.from("evaluation_milestones").select("id,style_term_id,role_term_id,level_term_id,aptitude_term_id,milestone_key,label,threshold_score,sort_order,active").order("threshold_score").order("sort_order");
    if(result.error){notify(result.error.message);return;}
    setMilestones((result.data??[]) as Milestone[]);
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  const filteredMilestones=milestones.filter((row)=>row.style_term_id===styleId&&row.role_term_id===roleId&&row.level_term_id===levelId&&row.aptitude_term_id===aptitudeId);

  async function addMilestone(){
    const score=Number(threshold);
    if(!styleId||!roleId||!levelId||!aptitudeId||!label.trim()||!threshold.trim()||!Number.isInteger(score)||score<0||score>100){notify("Completa contexto, nombre y una puntuación de hito entre 0 y 100.");return;}
    setBusy("milestone");
    const user=await client.auth.getUser();
    const context=`${styleId}.${roleId}.${levelId}.${aptitudeId}`;
    const result=await client.from("evaluation_milestones").insert({style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,milestone_key:`${context}.${slug(label)}.${Date.now()}`,label:label.trim(),threshold_score:score,sort_order:score,active:true,created_by:user.data.user?.id??null});
    if(result.error)notify(result.error.message);else{setLabel("");setThreshold("");await load();notify("Hito creado.");}
    setBusy("");
  }

  function startMilestoneEdit(row:Milestone){setEditingMilestoneId(row.id);setEditLabel(row.label);setEditThreshold(String(row.threshold_score));}
  function cancelMilestoneEdit(){setEditingMilestoneId(null);setEditLabel("");setEditThreshold("");}

  async function saveMilestoneEdit(row:Milestone){
    const score=Number(editThreshold);
    if(!editLabel.trim()||!editThreshold.trim()||!Number.isInteger(score)||score<0||score>100){notify("Indica un nombre y una puntuación de hito entre 0 y 100.");return;}
    setBusy(`milestone-edit-${row.id}`);
    const result=await client.from("evaluation_milestones").update({label:editLabel.trim(),threshold_score:score,sort_order:score,updated_at:new Date().toISOString()}).eq("id",row.id);
    if(result.error)notify(result.error.message);else{cancelMilestoneEdit();await load();notify("Hito actualizado.");}
    setBusy("");
  }

  async function toggleMilestoneActive(row:Milestone){
    setBusy(`milestone-toggle-${row.id}`);
    const result=await client.from("evaluation_milestones").update({active:!row.active,updated_at:new Date().toISOString()}).eq("id",row.id);
    if(result.error)notify(result.error.message);else{await load();notify(row.active?"Hito desactivado.":"Hito activado.");}
    setBusy("");
  }

  async function removeMilestone(id:number){
    if(!window.confirm("¿Eliminar este hito? Si ya tiene historial, CYA impedirá una eliminación insegura."))return;
    setBusy(`milestone-${id}`);
    const result=await client.from("evaluation_milestones").delete().eq("id",id);
    if(result.error)notify(result.error.message);else{if(editingMilestoneId===id)cancelMilestoneEdit();await load();notify("Hito eliminado.");}
    setBusy("");
  }

  return <section className="admin-stack p0f-evaluation-admin">
    <header className="admin-section-head"><div><p className="eyebrow">Evaluación por hitos</p><h2>Hitos de evaluación</h2><p>Define referencias claras por estilo, rol, nivel y parámetro. La evolución del alumno se conserva en su historial, sin una configuración adicional de progreso automático en Administración.</p></div></header>
    <article className="card pad"><div className="fields-2 p0f-context-grid"><label className="field"><span>Estilo</span><select value={styleId??""} onChange={(e)=>setStyleId(Number(e.target.value)||null)}>{styles.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Rol</span><select value={roleId??""} onChange={(e)=>setRoleId(Number(e.target.value)||null)}>{roles.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={levelId??""} onChange={(e)=>setLevelId(Number(e.target.value)||null)}>{levels.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><label className="field"><span>Parámetro</span><select value={aptitudeId??""} onChange={(e)=>setAptitudeId(Number(e.target.value)||null)}>{aptitudes.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label></div></article>
    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Categorías pedagógicas</p><h2>Hitos del parámetro</h2></div><span className="badge">{filteredMilestones.length}</span></div>{filteredMilestones.length?<div className="p0f-admin-list">{filteredMilestones.map((row)=>editingMilestoneId===row.id?<div key={row.id}><div className="fields-2 p0f-create-row"><label className="field"><span>Nombre del hito</span><input value={editLabel} onChange={(e)=>setEditLabel(e.target.value)}/></label><label className="field"><span>Valor de referencia</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={editThreshold} onChange={(e)=>setEditThreshold(boundedScoreText(e.target.value))}/></label></div><div className="actions"><button type="button" className="btn ghost" onClick={cancelMilestoneEdit}>Cancelar</button><button type="button" className="btn" disabled={busy===`milestone-edit-${row.id}`} onClick={()=>void saveMilestoneEdit(row)}>Guardar hito</button></div></div>:<div key={row.id}><span><strong>{row.label}</strong><small>Referencia {row.threshold_score} puntos · {row.active?"Activo":"Inactivo"}</small></span><span className="p0f-admin-row-actions"><button type="button" className="icon-btn" aria-label={`Editar ${row.label}`} onClick={()=>startMilestoneEdit(row)}><Pencil size={16}/></button><button type="button" className="icon-btn" aria-label={row.active?`Desactivar ${row.label}`:`Activar ${row.label}`} disabled={busy===`milestone-toggle-${row.id}`} onClick={()=>void toggleMilestoneActive(row)}>{row.active?<PowerOff size={16}/>:<Power size={16}/>}</button><button type="button" className="icon-btn" aria-label={`Eliminar ${row.label}`} disabled={busy===`milestone-${row.id}`} onClick={()=>void removeMilestone(row.id)}><Trash2 size={16}/></button></span></div>)}</div>:<p className="modal-intro">Todavía no hay hitos en este contexto. CYA no inventará ninguno.</p>}<div className="fields-2 p0f-create-row"><label className="field"><span>Nombre del hito</span><input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Ej. Encuentra el 1 y el 5"/></label><label className="field"><span>Valor de referencia</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={threshold} onChange={(e)=>setThreshold(boundedScoreText(e.target.value))} placeholder="0–100"/></label></div><button type="button" className="btn" disabled={busy==="milestone"} onClick={()=>void addMilestone()}><Plus size={16}/> Añadir hito</button></article>
  </section>;
}
