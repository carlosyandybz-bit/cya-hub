"use client";

import { BarChart3, Copy, Plus, Save, Star, Trash2, UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type Metric = { key:string; block:string; label:string; format:string; filters:string[] };
type Dashboard = { id:number; name:string; description:string|null; scope:"global"|"teacher"|"personal"; target_user_id:string|null; active:boolean; is_default:boolean };
type Card = { id:number; dashboard_id:number; title:string; metric_key:string; period_kind:string; period_days:number|null; filters:Record<string,unknown>; position:number; width:string; active:boolean };
type Profile = { id:string; display_name:string };
type Assignment = { dashboard_id:number; user_id:string; is_default:boolean };
type MetricSetting = { metric_key:string; active:boolean; featured:boolean; sort_order:number };
const periodLabels:Record<string,string>={today:"Hoy",this_week:"Esta semana",this_month:"Este mes",this_year:"Este año",rolling_days:"Últimos N días"};
const blockLabels:Record<string,string>={classes:"Clases",students:"Alumnado",business:"Negocio",teaching:"Enseñanza",marketing:"Marketing",operations:"Operación"};

export function AdminStatistics({client,notify}:{client:SupabaseClient;notify:(message:string)=>void}){
  const [metrics,setMetrics]=useState<Metric[]>([]),[metricSettings,setMetricSettings]=useState<MetricSetting[]>([]);
  const [dashboards,setDashboards]=useState<Dashboard[]>([]),[cards,setCards]=useState<Card[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]);
  const [selected,setSelected]=useState<number|null>(null),[quickPeriods,setQuickPeriods]=useState("7,30,90,365"),[busy,setBusy]=useState(false);
  const [newName,setNewName]=useState(""),[newScope,setNewScope]=useState<Dashboard["scope"]>("global"),[newTeacher,setNewTeacher]=useState("");
  const [metricKey,setMetricKey]=useState(""),[cardTitle,setCardTitle]=useState(""),[periodKind,setPeriodKind]=useState("this_month"),[periodDays,setPeriodDays]=useState("30"),[location,setLocation]=useState(""),[locationScope,setLocationScope]=useState("inside");

  const load=useCallback(async()=>{
    const [catalog,d,c,p,a,s,ms]=await Promise.all([
      client.rpc("statistics_metric_catalog"),client.from("statistics_dashboards").select("id,name,description,scope,target_user_id,active,is_default").order("name"),
      client.from("statistics_dashboard_cards").select("id,dashboard_id,title,metric_key,period_kind,period_days,filters,position,width,active").order("position"),
      client.from("user_profiles").select("id,display_name").order("display_name"),client.from("statistics_dashboard_assignments").select("dashboard_id,user_id,is_default"),
      client.from("statistics_settings").select("quick_periods").eq("singleton",true).maybeSingle(),client.from("statistics_metric_settings").select("metric_key,active,featured,sort_order")
    ]);
    const error=[catalog,d,c,p,a,s,ms].find((r)=>r.error)?.error; if(error){notify(error.message);return;}
    const nextMetrics=(catalog.data??[]) as Metric[]; setMetrics(nextMetrics); setMetricSettings((ms.data??[]) as MetricSetting[]); setDashboards((d.data??[]) as Dashboard[]); setCards((c.data??[]) as Card[]); setProfiles((p.data??[]) as Profile[]); setAssignments((a.data??[]) as Assignment[]);
    if(s.data?.quick_periods)setQuickPeriods((s.data.quick_periods as number[]).join(",")); setSelected((value)=>value??((d.data?.[0] as Dashboard|undefined)?.id??null)); if(!metricKey&&nextMetrics[0])setMetricKey(nextMetrics[0].key);
  },[client,metricKey,notify]);
  useEffect(()=>{void load();},[load]);

  const selectedDashboard=dashboards.find((d)=>d.id===selected)??null;
  const selectedCards=cards.filter((c)=>c.dashboard_id===selected);
  const settingsMap=useMemo(()=>new Map(metricSettings.map((item)=>[item.metric_key,item])),[metricSettings]);
  const grouped=useMemo(()=>metrics.reduce<Record<string,Metric[]>>((all,m)=>({...all,[m.block]:[...(all[m.block]??[]),m]}),{}),[metrics]);

  async function createDashboard(){
    const name=newName.trim(); if(!name){notify("Pon un nombre al panel.");return;} if(newScope==='teacher'&&!newTeacher){notify("Elige al menos un profesor.");return;}
    setBusy(true); const payload={name,scope:newScope,target_user_id:newScope==='global'?null:newTeacher||null,active:true,is_default:false}; const result=await client.from("statistics_dashboards").insert(payload).select("id").single();
    if(result.error)notify(result.error.message); else { if(newScope==='teacher'&&newTeacher)await client.from("statistics_dashboard_assignments").upsert({dashboard_id:result.data.id,user_id:newTeacher,is_default:true}); setNewName("");setSelected(result.data.id);await load();notify("Panel creado."); } setBusy(false);
  }
  async function assignTeacher(userId:string){ if(!selectedDashboard)return; setBusy(true); const exists=assignments.some((a)=>a.dashboard_id===selectedDashboard.id&&a.user_id===userId); const r=exists?await client.from("statistics_dashboard_assignments").delete().eq("dashboard_id",selectedDashboard.id).eq("user_id",userId):await client.from("statistics_dashboard_assignments").insert({dashboard_id:selectedDashboard.id,user_id:userId,is_default:true}); if(r.error)notify(r.error.message);else await load();setBusy(false); }
  async function addCard(){
    if(!selectedDashboard||!metricKey)return; const metric=metrics.find((m)=>m.key===metricKey); const filters:Record<string,unknown>={}; if(location&&metric?.filters.includes("class_location")){filters.class_location=location;filters.location_scope=locationScope;}
    const payload={dashboard_id:selectedDashboard.id,title:cardTitle.trim()||metric?.label||metricKey,metric_key:metricKey,period_kind:periodKind,period_days:periodKind==='rolling_days'?Number(periodDays)||30:null,filters,display_kind:metric?.format||"number",position:selectedCards.length,width:"small",active:true}; setBusy(true);const r=await client.from("statistics_dashboard_cards").insert(payload);if(r.error)notify(r.error.message);else{setCardTitle("");setLocation("");await load();notify("Tarjeta añadida.");}setBusy(false);
  }
  async function removeCard(id:number){setBusy(true);const r=await client.from("statistics_dashboard_cards").delete().eq("id",id);if(r.error)notify(r.error.message);else await load();setBusy(false);}
  async function toggleMetric(metric:Metric,field:"active"|"featured") { const current=settingsMap.get(metric.key)??{metric_key:metric.key,active:true,featured:false,sort_order:0}; const r=await client.from("statistics_metric_settings").upsert({...current,[field]:!current[field]});if(r.error)notify(r.error.message);else await load(); }
  async function savePeriods(){const values=[...new Set(quickPeriods.split(",").map((v)=>Number(v.trim())).filter((v)=>Number.isInteger(v)&&v>=1&&v<=3650))];if(!values.length){notify("Añade al menos un periodo válido.");return;}const r=await client.from("statistics_settings").update({quick_periods:values,updated_at:new Date().toISOString()}).eq("singleton",true);if(r.error)notify(r.error.message);else notify("Periodos rápidos guardados.");}
  async function duplicateDashboard(){if(!selectedDashboard)return;setBusy(true);const d=await client.from("statistics_dashboards").insert({name:`${selectedDashboard.name} · copia`,scope:"global",active:true,is_default:false}).select("id").single();if(!d.error){const source=selectedCards.map(({id:_,dashboard_id:__,...card},index)=>({...card,dashboard_id:d.data.id,position:index}));if(source.length)await client.from("statistics_dashboard_cards").insert(source);setSelected(d.data.id);await load();}else notify(d.error.message);setBusy(false);}

  return <section className="admin-stack statistics-admin">
    <header className="admin-section-head"><div><h2>Estadísticas</h2><p>Decide qué ve cada profesor al abrir Estadísticas y crea paneles con las métricas que realmente te interesan.</p></div><BarChart3 /></header>
    <article className="card pad"><div className="card-head"><h2>Periodos rápidos</h2><Save /></div><p className="muted">Días separados por comas. Cada tarjeta también puede usar Hoy, Semana, Mes o Año.</p><div className="form-row"><input value={quickPeriods} onChange={(e)=>setQuickPeriods(e.target.value)} placeholder="7,30,90,365"/><button className="btn" onClick={()=>void savePeriods()}><Save/>Guardar</button></div></article>
    <article className="card pad"><div className="card-head"><h2>Crear panel</h2><Plus /></div><div className="form-row"><input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="Ej. Mi semana"/><select value={newScope} onChange={(e)=>setNewScope(e.target.value as Dashboard["scope"])}><option value="global">Todos los profesores</option><option value="teacher">Profesores concretos</option><option value="personal">Personal</option></select>{newScope!=="global"?<select value={newTeacher} onChange={(e)=>setNewTeacher(e.target.value)}><option value="">Elegir profesor</option>{profiles.map((p)=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>:null}<button className="btn" disabled={busy} onClick={()=>void createDashboard()}><Plus/>Crear</button></div></article>
    <div className="admin-content-grid"><article className="card pad"><div className="card-head"><h2>Paneles guardados</h2><span>{dashboards.length}</span></div><div className="term-list">{dashboards.map((d)=><button key={d.id} className={selected===d.id?"active":""} onClick={()=>setSelected(d.id)}><strong>{d.name}</strong><small>{d.scope==='global'?"Todos":d.scope==='personal'?"Personal":"Asignado"}</small></button>)}</div></article>
    <article className="card pad"><div className="card-head"><h2>{selectedDashboard?.name??"Selecciona un panel"}</h2>{selectedDashboard?<button className="btn ghost" onClick={()=>void duplicateDashboard()}><Copy/>Duplicar</button>:null}</div>{selectedDashboard?.scope==='teacher'?<div><p className="muted"><UsersRound/> Profesores que usarán este panel</p><div className="role-chip-list">{profiles.map((p)=>{const active=assignments.some((a)=>a.dashboard_id===selectedDashboard.id&&a.user_id===p.id)||selectedDashboard.target_user_id===p.id;return <button key={p.id} className={active?"active":""} onClick={()=>void assignTeacher(p.id)}>{p.display_name}</button>;})}</div></div>:null}<div className="term-list">{selectedCards.map((c)=><div key={c.id}><span><strong>{c.title}</strong><small>{periodLabels[c.period_kind]??c.period_kind}{c.filters.class_location?` · ${c.filters.location_scope==='outside'?"fuera de ":""}${String(c.filters.class_location)}`:""}</small></span><button className="icon-btn" onClick={()=>void removeCard(c.id)}><Trash2/></button></div>)}</div></article></div>
    {selectedDashboard?<article className="card pad"><div className="card-head"><h2>Añadir tarjeta</h2><Plus /></div><div className="form-row"><select value={metricKey} onChange={(e)=>setMetricKey(e.target.value)}>{Object.entries(grouped).map(([block,items])=><optgroup key={block} label={blockLabels[block]??block}>{items.filter((m)=>settingsMap.get(m.key)?.active!==false).map((m)=><option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}</select><input value={cardTitle} onChange={(e)=>setCardTitle(e.target.value)} placeholder="Título opcional"/><select value={periodKind} onChange={(e)=>setPeriodKind(e.target.value)}>{Object.entries(periodLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{periodKind==='rolling_days'?<input type="number" min="1" max="3650" value={periodDays} onChange={(e)=>setPeriodDays(e.target.value)}/>:null}{metrics.find((m)=>m.key===metricKey)?.filters.includes("class_location")?<><input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Ubicación, ej. Málaga"/><select value={locationScope} onChange={(e)=>setLocationScope(e.target.value)}><option value="inside">En esta ubicación</option><option value="outside">Fuera de esta ubicación</option></select></>:null}<button className="btn" onClick={()=>void addCard()}><Plus/>Añadir</button></div></article>:null}
    <article className="card pad"><div className="card-head"><h2>Catálogo de métricas</h2><Star /></div>{Object.entries(grouped).map(([block,items])=><div key={block}><h3>{blockLabels[block]??block}</h3><div className="role-chip-list">{items.map((m)=>{const setting=settingsMap.get(m.key);return <div key={m.key}><span>{m.label}</span><button className={setting?.active===false?"":"active"} onClick={()=>void toggleMetric(m,"active")}>{setting?.active===false?"Oculta":"Disponible"}</button><button className={setting?.featured?"active":""} onClick={()=>void toggleMetric(m,"featured")}><Star/>Preferente</button></div>;})}</div></div>)}</article>
  </section>;
}
