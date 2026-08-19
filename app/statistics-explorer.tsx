"use client";

import { BarChart3 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { statisticBlockLabels, statisticCatalog } from "./statistics-catalog";
import { calculateStatistic } from "./statistics-engine";
import { StatisticsCrmDashboard } from "./statistics-crm-dashboard-v2";
import { StatisticsCatalogPanels } from "./statistics-catalog-panels";
import { StatisticsPanelInsights } from "./statistics-panel-insights";
import styles from "./statistics-view.module.css";

type PeriodDays=30|90|365;
type Values=Record<string,number|null>;

function display(value:number|null|undefined,format:string){
  if(value==null)return "Sin datos";
  if(format==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);
  if(format==="minutes"){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`;}
  if(format==="percentage")return `${Math.round(value*10)/10}%`;
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value);
}

export function StatisticsExplorer({client,leave,notify}:{client:SupabaseClient;leave:()=>void;notify:(message:string)=>void}){
  const [days,setDays]=useState<PeriodDays>(30),[values,setValues]=useState<Values>({}),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    const results=await Promise.all(statisticCatalog.map(async(metric)=>{
      try{return [metric.key,(await calculateStatistic(client,metric.key,{kind:"rolling_days",days})).value] as const;}
      catch{return [metric.key,null] as const;}
    }));
    setValues(Object.fromEntries(results));setLoading(false);
  },[client,days]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  useEffect(() => {
    const onPullRefresh = (event: Event) => {
      const promise = load();
      const detail = (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail;
      detail?.waitUntil?.(promise);
    };
    window.addEventListener("cya:refresh", onPullRefresh);
    return () => window.removeEventListener("cya:refresh", onPullRefresh);
  }, [load]);
  const blocks=[...new Set(statisticCatalog.map((metric)=>metric.block))];

  return <section className={styles.workspace}>
    <header className={styles.hero}><div><button type="button" onClick={leave}>‹ Volver</button><span>Análisis CYA</span><h1>Todas las estadísticas</h1><p>Crea paneles propios desde cualquier dato del CRM o desde cualquiera de las métricas operativas de CYA.</p></div><BarChart3/></header>
    <StatisticsCrmDashboard client={client} notify={notify} />
    <StatisticsCatalogPanels client={client} notify={notify} />
    <StatisticsPanelInsights client={client} notify={notify} />
    <div className={styles.catalogDivider}><span>Catálogo general</span><p>Métricas operativas predefinidas por periodo.</p></div>
    <div className={styles.toolbar}><div className={styles.periods}>{([30,90,365] as PeriodDays[]).map((value)=><button key={value} type="button" className={days===value?styles.activePeriod:""} onClick={()=>setDays(value)}>{value===365?"1 año":`${value} días`}</button>)}</div></div>
    {loading?<div className={styles.loading}>Actualizando estadísticas…</div>:blocks.map((block)=><section key={block}><h2>{statisticBlockLabels[block]}</h2><div className={styles.metricGrid}>{statisticCatalog.filter((metric)=>metric.block===block).map((metric)=><article className={styles.metric} key={metric.key}><div><span>{metric.label}</span><strong>{display(values[metric.key],metric.format)}</strong><small>{metric.description}</small></div></article>)}</div></section>)}
  </section>;
}
