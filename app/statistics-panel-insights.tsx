"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { statisticCatalog, statisticBlockLabels, type StatisticMetric } from "./statistics-catalog";
import { calculateStatistic, statisticPeriodBounds, type StatisticPeriod } from "./statistics-engine";
import styles from "./statistics-panel-insights.module.css";

type ChartKind="none"|"line"|"bars";
type DisplayConfig={comparison?:boolean;chart?:ChartKind};
type Panel={id:number;title:string;description:string|null;metric_key:string;filters:Record<string,unknown>;period:Record<string,unknown>;display_config?:DisplayConfig};
type Result={current:number|null;previous:number|null;series:Array<number|null>};

function storedPeriod(value:Record<string,unknown>|null|undefined):StatisticPeriod{
 const kind=String(value?.kind??"rolling_days") as StatisticPeriod["kind"];
 if(kind==="rolling_days")return{kind,days:Number(value?.days??30)};
 if(kind==="today"||kind==="this_week"||kind==="this_month"||kind==="this_year")return{kind};
 if(kind==="custom")return{kind,from:String(value?.from??""),to:String(value?.to??"")};
 return{kind:"rolling_days",days:30};
}
function previousPeriod(period:StatisticPeriod):StatisticPeriod{
 const b=statisticPeriodBounds(period);const d=b.to.getTime()-b.from.getTime();
 return{kind:"custom",from:new Date(b.from.getTime()-d).toISOString(),to:b.from.toISOString()};
}
function config(value:DisplayConfig|undefined){return{comparison:value?.comparison!==false,chart:value?.chart??"line" as ChartKind}}
function format(metric:StatisticMetric,value:number|null){if(value==null)return"Sin datos";if(metric.format==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);if(metric.format==="percentage")return`${new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value)} %`;if(metric.format==="minutes"){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`}return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value)}
function delta(current:number|null,previous:number|null){if(current==null||previous==null||previous===0)return null;return((current-previous)/Math.abs(previous))*100}
async function series(client:SupabaseClient,panel:Panel){const period=storedPeriod(panel.period),b=statisticPeriodBounds(period),duration=b.to.getTime()-b.from.getTime(),count=duration<3*86400000?8:duration<120*86400000?10:12,step=duration/count;return Promise.all(Array.from({length:count},async(_,i)=>{const from=new Date(b.from.getTime()+step*i),to=new Date(i===count-1?b.to.getTime():b.from.getTime()+step*(i+1));try{return(await calculateStatistic(client,panel.metric_key,{kind:"custom",from:from.toISOString(),to:to.toISOString()},panel.filters)).value}catch{return null}}))}

function Spark({values,kind}:{values:Array<number|null>;kind:Exclude<ChartKind,"none">}){const nums=values.filter((v):v is number=>v!=null&&Number.isFinite(v));if(nums.length<2)return null;const min=Math.min(...nums),max=Math.max(...nums),range=max-min||1;if(kind==="bars")return <div className={styles.bars}>{values.map((v,i)=><i key={i} style={{height:`${v==null?5:12+((v-min)/range)*50}px`}}/>)}</div>;const points=values.map((v,i)=>`${values.length===1?50:i/(values.length-1)*100},${v==null?50:90-((v-min)/range)*80}`).join(" ");return <svg className={styles.line} viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points}/></svg>}

export function StatisticsPanelInsights({client,notify}:{client:SupabaseClient;notify:(message:string)=>void}){
 const[panels,setPanels]=useState<Panel[]>([]),[results,setResults]=useState<Record<number,Result>>({}),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState("");
 const load=useCallback(async()=>{const r=await client.rpc("catalog_stat_panels_snapshot");if(r.error)setError(r.error.message);else setPanels((r.data??[])as Panel[])},[client]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{let stop=false;(async()=>{const next:Record<number,Result>={};await Promise.all(panels.map(async p=>{const c=config(p.display_config);try{const current=(await calculateStatistic(client,p.metric_key,storedPeriod(p.period),p.filters)).value;const previous=c.comparison?(await calculateStatistic(client,p.metric_key,previousPeriod(storedPeriod(p.period)),p.filters)).value:null;const values=c.chart!=="none"?await series(client,p):[];next[p.id]={current,previous,series:values}}catch{next[p.id]={current:null,previous:null,series:[]}}}));if(!stop)setResults(next)})();return()=>{stop=true}},[client,panels]);
 async function change(panel:Panel,next:DisplayConfig){setBusy(panel.id);const merged={...config(panel.display_config),...next};const r=await client.rpc("set_stat_panel_display_config",{p_panel_id:panel.id,p_display_config:merged});if(r.error)setError(r.error.message);else{notify("Presentación del panel actualizada");await load()}setBusy(null)}
 const valid=useMemo(()=>panels.filter(p=>statisticCatalog.some(m=>m.key===p.metric_key)),[panels]);
 if(!valid.length)return null;
 return <section className={styles.section}><div className={styles.head}><div><span>Tendencias</span><h2>Comparación y evolución</h2><p>El cambio compara cada métrica con un intervalo inmediatamente anterior de la misma duración.</p></div></div>{error?<p className={styles.error}>{error}</p>:null}<div className={styles.grid}>{valid.map(panel=>{const metric=statisticCatalog.find(m=>m.key===panel.metric_key)!;const c=config(panel.display_config),r=results[panel.id]??{current:null,previous:null,series:[]},d=delta(r.current,r.previous);return <article className={styles.card} key={panel.id}><div className={styles.top}><span>{statisticBlockLabels[metric.block]}</span><div><select disabled={busy===panel.id} value={c.comparison?"yes":"no"} onChange={e=>void change(panel,{comparison:e.target.value==="yes"})}><option value="yes">Comparar</option><option value="no">Sin comparar</option></select><select disabled={busy===panel.id} value={c.chart} onChange={e=>void change(panel,{chart:e.target.value as ChartKind})}><option value="line">Línea</option><option value="bars">Barras</option><option value="none">Sin gráfico</option></select></div></div><div className={styles.value}><strong>{format(metric,r.current)}</strong>{c.comparison?<span className={d==null?styles.neutral:d>0?styles.up:d<0?styles.down:styles.neutral}>{d==null?<Minus/>:d>0?<TrendingUp/>:d<0?<TrendingDown/>:<Minus/>}{d==null?"Sin referencia":`${d>0?"+":""}${new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(d)} %`}</span>:null}</div>{c.chart!=="none"?<Spark values={r.series} kind={c.chart}/>:null}<h3>{panel.title}</h3><small>{c.comparison?`Periodo anterior: ${format(metric,r.previous)}`:"Comparación desactivada"}</small></article>})}</div></section>
}
