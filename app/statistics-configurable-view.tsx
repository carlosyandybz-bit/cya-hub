"use client";

import { BarChart3, SlidersHorizontal } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatisticsView } from "./statistics-view";

type Dashboard = { id:number; name:string; description:string|null };
type Card = { id:number; title:string; metric_key:string; period_kind:string; period_days:number|null; filters:Record<string,unknown>; display_kind:string; width:string };
type CardResult = { metric_key:string; value:number|null; from:string; to:string };
type DashboardSnapshot = { dashboard:Dashboard|null; cards:Card[] };

function formatValue(value:number|null,kind:string){
  if(value==null)return "Sin datos";
  if(kind==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);
  if(kind==="minutes"){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`;}
  if(kind==="percentage")return `${Math.round(value*10)/10}%`;
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value);
}
function periodLabel(card:Card){if(card.period_kind==="today")return "Hoy";if(card.period_kind==="this_week")return "Esta semana";if(card.period_kind==="this_month")return "Este mes";if(card.period_kind==="this_year")return "Este año";if(card.period_kind==="rolling_days")return `Últimos ${card.period_days??30} días`;return "Periodo personalizado";}

export function ConfigurableStatisticsView({client,leave,notify}:{client:SupabaseClient;leave:()=>void;notify:(message:string)=>void}){
  const [dashboard,setDashboard]=useState<DashboardSnapshot|null>(null),[values,setValues]=useState<Record<number,CardResult>>({}),[explore,setExplore]=useState(false),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);const result=await client.rpc("statistics_dashboard_for_current_user");
    if(result.error){notify(result.error.message);setLoading(false);return;}
    const next=result.data as DashboardSnapshot;setDashboard(next);
    const resolved=await Promise.all((next.cards??[]).map(async(card)=>{const value=await client.rpc("statistics_card_value",{p_metric_key:card.metric_key,p_period_kind:card.period_kind,p_period_days:card.period_days,p_filters:card.filters??{}});return [card.id,value] as const;}));
    const map:Record<number,CardResult>={};for(const [id,resultValue] of resolved){if(resultValue.error)notify(resultValue.error.message);else map[id]=resultValue.data as CardResult;}setValues(map);setLoading(false);
  },[client,notify]);
  useEffect(()=>{void load();},[load]);
  const cards=dashboard?.cards??[];const locationHint=useMemo(()=>cards.some((c)=>c.filters?.class_location),[cards]);
  if(explore)return <StatisticsView client={client} leave={()=>setExplore(false)} notify={notify}/>;
  return <section className="statistics-configurable">
    <header className="page-head"><div><p className="eyebrow">Análisis CYA</p><h1>{dashboard?.dashboard?.name??"Estadísticas"}</h1><p>{dashboard?.dashboard?.description??"Tu panel rápido con las cifras que más te interesan."}</p></div><div className="actions"><button className="btn ghost" onClick={()=>setExplore(true)}><BarChart3/>Todas las estadísticas</button><button className="btn ghost" onClick={leave}>Volver</button></div></header>
    {loading?<div className="card pad compact-empty">Calculando tu panel…</div>:cards.length?<div className="admin-metric-grid">{cards.map((card)=><article className={`card pad statistics-card statistics-card-${card.width}`} key={card.id}><span className="eyebrow">{periodLabel(card)}</span><h2>{card.title}</h2><strong>{formatValue(values[card.id]?.value??null,card.display_kind)}</strong>{card.filters.class_location?<small>{card.filters.location_scope==="outside"?"Fuera de ":"En "}{String(card.filters.class_location)}</small>:null}</article>)}</div>:<article className="card pad compact-empty"><SlidersHorizontal/><span>Aún no tienes un panel principal configurado. Administración puede crear uno global o asignarte uno específico.</span></article>}
    {locationHint?<p className="muted">Las ubicaciones de clase se filtran por el texto real guardado en cada clase. La localidad del alumno se añadirá cuando exista ese dato canónico en su ficha.</p>:null}
  </section>;
}
