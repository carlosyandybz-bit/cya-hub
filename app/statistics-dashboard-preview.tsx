"use client";

import { Eye, EyeOff } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { statisticCatalogByKey } from "./statistics-catalog";
import { calculateStatistic, type StatisticPeriod } from "./statistics-engine";

type PreviewCard={id:number;title:string;metric_key:string;period_kind:string;period_days:number|null;filters:Record<string,unknown>;display_kind:string;width:string};

function cardPeriod(card:PreviewCard):StatisticPeriod{
  if(card.period_kind==="custom")return {kind:"custom",from:String(card.filters.period_from??""),to:String(card.filters.period_to??"")};
  return {kind:card.period_kind as StatisticPeriod["kind"],days:card.period_days};
}

function formatValue(value:number|null,card:PreviewCard){
  if(value==null)return "Sin datos";
  const baseFormat=statisticCatalogByKey.get(card.metric_key)?.format??"number";
  const format=card.display_kind==="trend"?baseFormat:card.display_kind;
  if(format==="currency")return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value/100);
  if(format==="minutes"){
    const hours=Math.floor(value/60),minutes=Math.round(value%60);
    return hours?`${hours} h${minutes?` ${minutes} min`:""}`:`${minutes} min`;
  }
  if(format==="percentage")return `${Math.round(value*10)/10}%`;
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value);
}

export function StatisticsDashboardPreview({client,dashboardName,cards,notify}:{client:SupabaseClient;dashboardName:string;cards:PreviewCard[];notify:(message:string)=>void}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[values,setValues]=useState<Record<number,number|null>>({});

  async function preview(){
    setBusy(true);
    const next:Record<number,number|null>={},errors:string[]=[];
    await Promise.all(cards.map(async(card)=>{
      try{next[card.id]=(await calculateStatistic(client,card.metric_key,cardPeriod(card),card.filters)).value;}
      catch(error){next[card.id]=null;errors.push(error instanceof Error?error.message:"No se ha podido calcular una tarjeta.");}
    }));
    setValues(next);setOpen(true);setBusy(false);
    if(errors.length)notify([...new Set(errors)].slice(0,2).join(" · "));
  }

  return <>
    <button className="btn ghost" disabled={busy} onClick={()=>void preview()}><Eye/>{busy?"Calculando…":"Previsualizar"}</button>
    {open?<article className="card pad statistics-preview"><div className="card-head"><div><h3>Previsualización · {dashboardName}</h3><p className="muted">Datos reales. Esta vista no publica ni modifica el panel.</p></div><button className="btn ghost" onClick={()=>setOpen(false)}><EyeOff/>Cerrar</button></div>{cards.length?<div className="admin-metric-grid">{cards.map((card)=><article className={`card pad statistics-card statistics-card-${card.width}`} key={card.id}><h4>{card.title}</h4><strong>{formatValue(values[card.id]??null,card)}</strong></article>)}</div>:<p className="muted">Añade tarjetas para previsualizar este panel.</p>}</article>:null}
  </>;
}
