"use client";

import { BarChart3, SlidersHorizontal } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { statisticCatalogByKey } from "./statistics-catalog";
import { resolveStatisticsDashboard, type StatisticsDashboardSnapshot, type StatisticsDashboardCard } from "./statistics-dashboard-data";
import { calculateStatistic, statisticPeriodBounds, type StatisticPeriod, type StatisticValue } from "./statistics-engine";
import { StatisticsView } from "./statistics-view";

type ComparisonKind="none"|"previous_period"|"previous_year";
type CardReading={current:StatisticValue;previous:number|null;comparison:ComparisonKind};

function formatValue(value:number|null,kind:string){
  if(value==null)return "Sin datos";
  if(kind==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);
  if(kind==="minutes"){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`;}
  if(kind==="percentage")return `${Math.round(value*10)/10}%`;
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value);
}
function periodLabel(card:StatisticsDashboardCard){
  if(card.period_kind==="today")return "Hoy";
  if(card.period_kind==="this_week")return "Esta semana";
  if(card.period_kind==="this_month")return "Este mes";
  if(card.period_kind==="this_year")return "Este año";
  if(card.period_kind==="rolling_days")return `Últimos ${card.period_days??30} días`;
  const from=String(card.filters.period_from??""),to=String(card.filters.period_to??"");
  return from&&to?`${from} → ${to}`:"Intervalo personalizado";
}
function cardPeriod(card:StatisticsDashboardCard):StatisticPeriod{
  if(card.period_kind==="custom")return {kind:"custom",from:String(card.filters.period_from??""),to:String(card.filters.period_to??"")};
  return {kind:card.period_kind,days:card.period_days};
}
function comparisonPeriod(period:StatisticPeriod,kind:ComparisonKind):StatisticPeriod|null{
  if(kind==="none")return null;
  const bounds=statisticPeriodBounds(period);
  if(kind==="previous_period"){
    const duration=bounds.to.getTime()-bounds.from.getTime();
    return {kind:"custom",from:new Date(bounds.from.getTime()-duration).toISOString(),to:bounds.from.toISOString()};
  }
  const from=new Date(bounds.from),to=new Date(bounds.to);
  from.setFullYear(from.getFullYear()-1);to.setFullYear(to.getFullYear()-1);
  return {kind:"custom",from:from.toISOString(),to:to.toISOString()};
}
function comparisonLabel(current:number|null,previous:number|null,kind:ComparisonKind){
  if(kind==="none")return null;
  const suffix=kind==="previous_year"?"frente al año anterior":"frente al periodo anterior";
  if(current==null||previous==null)return `Sin base comparable ${suffix}`;
  if(previous===0)return current===0?`Sin cambio ${suffix}`:`Sin base comparable ${suffix}`;
  const change=Math.round(((current-previous)/Math.abs(previous))*1000)/10;
  return `${change>0?"+":""}${change}% ${suffix}`;
}
function errorMessage(error:unknown){return error instanceof Error?error.message:"No se ha podido calcular una estadística.";}

export function ConfigurableStatisticsView({client,leave,notify}:{client:SupabaseClient;leave:()=>void;notify:(message:string)=>void}){
  const [dashboard,setDashboard]=useState<StatisticsDashboardSnapshot|null>(null),[values,setValues]=useState<Record<number,CardReading>>({}),[explore,setExplore]=useState(false),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const next=await resolveStatisticsDashboard(client);setDashboard(next);
      const ids=(next.cards??[]).map((card)=>card.id);
      const comparisonResult=ids.length?await client.from("statistics_dashboard_cards").select("id,comparison_kind").in("id",ids):{data:[],error:null};
      if(comparisonResult.error)throw new Error(comparisonResult.error.message);
      const comparisonMap=new Map((comparisonResult.data??[]).map((row)=>[Number(row.id),(row.comparison_kind??"none") as ComparisonKind]));
      const resolved=await Promise.all((next.cards??[]).map(async(card)=>{
        try{
          const period=cardPeriod(card);
          const current=await calculateStatistic(client,card.metric_key,period,card.filters??{});
          const comparison=comparisonMap.get(card.id)??"none";
          const previousPeriod=comparisonPeriod(period,comparison);
          const previous=previousPeriod?(await calculateStatistic(client,card.metric_key,previousPeriod,card.filters??{})).value:null;
          return {id:card.id,value:{current,previous,comparison} as CardReading,error:null as string|null};
        }catch(error){return {id:card.id,value:null,error:errorMessage(error)};}
      }));
      const map:Record<number,CardReading>={};const errors:string[]=[];
      for(const item of resolved){if(item.value)map[item.id]=item.value;if(item.error)errors.push(item.error);}
      setValues(map);if(errors.length)notify([...new Set(errors)].slice(0,2).join(" · "));
    }catch(error){notify(errorMessage(error));setDashboard({dashboard:null,cards:[]});setValues({});}
    setLoading(false);
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const cards=dashboard?.cards??[];const locationHint=cards.some((card)=>card.filters?.class_location);
  if(explore)return <StatisticsView client={client} leave={()=>setExplore(false)} notify={notify}/>;
  return <section className="statistics-configurable">
    <header className="page-head"><div><p className="eyebrow">Análisis CYA</p><h1>{dashboard?.dashboard?.name??"Estadísticas"}</h1><p>{dashboard?.dashboard?.description??"Tu panel rápido con las cifras que más te interesan."}</p></div><div className="actions"><button className="btn ghost" onClick={()=>setExplore(true)}><BarChart3/>Todas las estadísticas</button><button className="btn ghost" onClick={leave}>Volver</button></div></header>
    {loading?<div className="card pad compact-empty">Calculando tu panel…</div>:cards.length?<div className="admin-metric-grid">{cards.map((card)=>{const reading=values[card.id];const baseFormat=statisticCatalogByKey.get(card.metric_key)?.format??"number";const format=card.display_kind==="trend"?baseFormat:card.display_kind;const comparison=reading?comparisonLabel(reading.current.value,reading.previous,reading.comparison):null;return <article className={`card pad statistics-card statistics-card-${card.width}${card.display_kind==="trend"?" statistics-card-trend":""}`} key={card.id}><span className="eyebrow">{periodLabel(card)}</span><h2>{card.title}</h2><strong>{formatValue(reading?.current.value??null,format)}</strong>{comparison?<small>{comparison}</small>:null}{card.filters.class_location?<small>{card.filters.location_scope==="outside"?"Fuera de ":"En "}{String(card.filters.class_location)}</small>:null}</article>;})}</div>:<article className="card pad compact-empty"><SlidersHorizontal/><span>Aún no tienes un panel principal configurado. Administración puede crear uno global o asignarte uno específico.</span></article>}
    {locationHint?<p className="muted">Las ubicaciones de clase se filtran por el texto real guardado en cada clase. La localidad del alumno se añadirá cuando exista ese dato canónico en su ficha.</p>:null}
  </section>;
}
