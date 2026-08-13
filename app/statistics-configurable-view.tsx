"use client";

import { BarChart3, SlidersHorizontal } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { resolveStatisticsDashboard, type StatisticsDashboardSnapshot, type StatisticsDashboardCard } from "./statistics-dashboard-data";
import { calculateStatistic, type StatisticValue } from "./statistics-engine";
import { StatisticsView } from "./statistics-view";

function formatValue(value:number|null,kind:string){
  if(value==null)return "Sin datos";
  if(kind==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);
  if(kind==="minutes"){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`;}
  if(kind==="percentage")return `${Math.round(value*10)/10}%`;
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value);
}
function periodLabel(card:StatisticsDashboardCard){if(card.period_kind==="today")return "Hoy";if(card.period_kind==="this_week")return "Esta semana";if(card.period_kind==="this_month")return "Este mes";if(card.period_kind==="this_year")return "Este año";if(card.period_kind==="rolling_days")return `Últimos ${card.period_days??30} días`;return "Periodo personalizado";}
function errorMessage(error:unknown){return error instanceof Error?error.message:"No se ha podido calcular una estadística.";}

export function ConfigurableStatisticsView({client,leave,notify}:{client:SupabaseClient;leave:()=>void;notify:(message:string)=>void}){
  const [dashboard,setDashboard]=useState<StatisticsDashboardSnapshot|null>(null),[values,setValues]=useState<Record<number,StatisticValue>>({}),[explore,setExplore]=useState(false),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const next=await resolveStatisticsDashboard(client);setDashboard(next);
      const resolved=await Promise.all((next.cards??[]).map(async(card)=>{
        try{
          const value=await calculateStatistic(client,card.metric_key,{kind:card.period_kind,days:card.period_days},card.filters??{});
          return {id:card.id,value,error:null as string|null};
        }catch(error){return {id:card.id,value:null,error:errorMessage(error)};}
      }));
      const map:Record<number,StatisticValue>={};
      const errors:string[]=[];
      for(const item of resolved){if(item.value)map[item.id]=item.value;if(item.error)errors.push(item.error);}
      setValues(map);
      if(errors.length)notify([...new Set(errors)].slice(0,2).join(" · "));
    }catch(error){notify(errorMessage(error));setDashboard({dashboard:null,cards:[]});setValues({});}
    setLoading(false);
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const cards=dashboard?.cards??[];const locationHint=cards.some((c)=>c.filters?.class_location);
  if(explore)return <StatisticsView client={client} leave={()=>setExplore(false)} notify={notify}/>;
  return <section className="statistics-configurable">
    <header className="page-head"><div><p className="eyebrow">Análisis CYA</p><h1>{dashboard?.dashboard?.name??"Estadísticas"}</h1><p>{dashboard?.dashboard?.description??"Tu panel rápido con las cifras que más te interesan."}</p></div><div className="actions"><button className="btn ghost" onClick={()=>setExplore(true)}><BarChart3/>Todas las estadísticas</button><button className="btn ghost" onClick={leave}>Volver</button></div></header>
    {loading?<div className="card pad compact-empty">Calculando tu panel…</div>:cards.length?<div className="admin-metric-grid">{cards.map((card)=><article className={`card pad statistics-card statistics-card-${card.width}`} key={card.id}><span className="eyebrow">{periodLabel(card)}</span><h2>{card.title}</h2><strong>{formatValue(values[card.id]?.value??null,card.display_kind)}</strong>{card.filters.class_location?<small>{card.filters.location_scope==="outside"?"Fuera de ":"En "}{String(card.filters.class_location)}</small>:null}</article>)}</div>:<article className="card pad compact-empty"><SlidersHorizontal/><span>Aún no tienes un panel principal configurado. Administración puede crear uno global o asignarte uno específico.</span></article>}
    {locationHint?<p className="muted">Las ubicaciones de clase se filtran por el texto real guardado en cada clase. La localidad del alumno se añadirá cuando exista ese dato canónico en su ficha.</p>:null}
  </section>;
}
