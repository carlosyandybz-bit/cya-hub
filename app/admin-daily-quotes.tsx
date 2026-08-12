"use client";

import { Eye, FileUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./p24-home.module.css";

type Quote = { id:number; quote_text:string; month_day:string|null; override_date:string|null; active:boolean; source:string };
type Assignment = { quote_id:number };
type CsvRow = { quote_text:string; override_date:string|null; month_day:string|null; active:boolean; status:"new"|"duplicate"|"date_conflict"|"recurring_conflict"|"invalid"; reason:string };

function normalize(value:string){ return value.trim().toLocaleLowerCase("es"); }
function validMonthDay(value:string){ return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value); }
function parseCsvLine(line:string){
  const cells:string[]=[]; let current="", quoted=false;
  for(let i=0;i<line.length;i+=1){ const char=line[i]; if(char==='"'){ if(quoted&&line[i+1]==='"'){ current+='"'; i+=1; } else quoted=!quoted; } else if(char===','&&!quoted){ cells.push(current.trim()); current=""; } else current+=char; }
  cells.push(current.trim()); return cells;
}
function boolValue(value:string){ return !["0","false","no","inactiva","inactivo"].includes(normalize(value)); }

export function AdminDailyQuotes({client,notify}:{client:SupabaseClient;notify:(message:string)=>void}){
  const [quotes,setQuotes]=useState<Quote[]>([]), [assignments,setAssignments]=useState<Assignment[]>([]), [busy,setBusy]=useState(false);
  const [editId,setEditId]=useState<number|null>(null), [text,setText]=useState(""), [date,setDate]=useState(""), [monthDay,setMonthDay]=useState(""), [active,setActive]=useState(true);
  const [previewDate,setPreviewDate]=useState(()=>new Date().toISOString().slice(0,10)), [preview,setPreview]=useState<{text:string;selection_kind:string;assigned:boolean}|null>(null);
  const [csvRows,setCsvRows]=useState<CsvRow[]>([]);

  const load=useCallback(async()=>{
    const [q,a]=await Promise.all([
      client.from("daily_quotes").select("id,quote_text,month_day,override_date,active,source").order("active",{ascending:false}).order("id"),
      client.from("daily_quote_assignments").select("quote_id"),
    ]);
    if(q.error){ notify(q.error.message); return; }
    if(a.error){ notify(a.error.message); return; }
    setQuotes((q.data??[]) as Quote[]); setAssignments((a.data??[]) as Assignment[]);
  },[client,notify]);
  useEffect(()=>{ const timer=window.setTimeout(()=>void load(),0); return()=>clearTimeout(timer); },[load]);

  const used=useMemo(()=>new Set(assignments.map((item)=>item.quote_id)),[assignments]);
  function reset(){ setEditId(null); setText(""); setDate(""); setMonthDay(""); setActive(true); }
  function edit(quote:Quote){ setEditId(quote.id); setText(quote.quote_text); setDate(quote.override_date??""); setMonthDay(quote.month_day??""); setActive(quote.active); }

  async function save(){
    const clean=text.trim(); const recurring=monthDay.trim();
    if(!clean){ notify("Escribe una frase."); return; }
    if(date&&recurring){ notify("Usa una fecha concreta o una recurrencia anual, no ambas."); return; }
    if(recurring&&!validMonthDay(recurring)){ notify("La recurrencia debe usar MM-DD."); return; }
    setBusy(true);
    const payload={quote_text:clean,override_date:date||null,month_day:recurring||null,active,source:"manual"};
    const result=editId ? await client.from("daily_quotes").update(payload).eq("id",editId) : await client.from("daily_quotes").insert(payload);
    if(result.error) notify(result.error.message); else { notify(editId?"Frase actualizada.":"Frase creada."); reset(); await load(); }
    setBusy(false);
  }

  async function toggle(quote:Quote){ setBusy(true); const result=await client.from("daily_quotes").update({active:!quote.active}).eq("id",quote.id); if(result.error)notify(result.error.message); else await load(); setBusy(false); }
  async function remove(quote:Quote){
    if(used.has(quote.id)){ notify("Esta frase ya tiene historial diario. Desactívala en lugar de borrarla."); return; }
    setBusy(true); const result=await client.from("daily_quotes").delete().eq("id",quote.id); if(result.error)notify(result.error.message); else { notify("Frase eliminada."); await load(); } setBusy(false);
  }
  async function runPreview(){ const result=await client.rpc("preview_daily_quote",{p_date:previewDate}); if(result.error)notify(result.error.message); else setPreview(result.data as typeof preview); }

  async function readCsv(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0]; if(!file)return; const raw=await file.text();
    const lines=raw.split(/\r?\n/).filter((line)=>line.trim()); if(lines.length<2){ notify("El CSV no contiene filas."); return; }
    const headers=parseCsvLine(lines[0]).map(normalize);
    const idx=(...names:string[])=>headers.findIndex((header)=>names.includes(header));
    const textIndex=idx("frase","quote_text","texto"), dateIndex=idx("fecha","override_date"), recurringIndex=idx("mes_dia","month_day","recurrencia"), activeIndex=idx("activa","active");
    if(textIndex<0){ notify("El CSV necesita una columna frase o quote_text."); return; }
    const existingText=new Set(quotes.map((quote)=>normalize(quote.quote_text))); const existingDate=new Set(quotes.filter((q)=>q.override_date).map((q)=>q.override_date!)); const existingRecurring=new Set(quotes.filter((q)=>q.month_day&&!q.override_date).map((q)=>q.month_day!)); const batchText=new Set<string>(); const batchDate=new Set<string>(); const batchRecurring=new Set<string>();
    const rows=lines.slice(1).map((line):CsvRow=>{
      const cells=parseCsvLine(line), quote_text=(cells[textIndex]??"").trim(), override_date=dateIndex>=0?(cells[dateIndex]??"").trim()||null:null, month_day=recurringIndex>=0?(cells[recurringIndex]??"").trim()||null:null, rowActive=activeIndex>=0?boolValue(cells[activeIndex]??"true"):true;
      let status:CsvRow["status"]="new", reason="Lista para importar"; const key=normalize(quote_text);
      if(!quote_text||(override_date&&month_day)||(month_day&&!validMonthDay(month_day))){ status="invalid"; reason="Datos no válidos"; }
      else if(existingText.has(key)||batchText.has(key)){ status="duplicate"; reason="Texto duplicado"; }
      else if(override_date&&(existingDate.has(override_date)||batchDate.has(override_date))){ status="date_conflict"; reason="Fecha ya asignada"; }
      else if(month_day&&(existingRecurring.has(month_day)||batchRecurring.has(month_day))){ status="recurring_conflict"; reason="Recurrencia ya asignada"; }
      if(status==="new"){ batchText.add(key); if(override_date)batchDate.add(override_date); if(month_day)batchRecurring.add(month_day); }
      return {quote_text,override_date,month_day,active:rowActive,status,reason};
    });
    setCsvRows(rows); event.target.value="";
  }

  async function importCsv(){ const valid=csvRows.filter((row)=>row.status==="new"); if(!valid.length){ notify("No hay filas nuevas válidas."); return; } setBusy(true); const result=await client.from("daily_quotes").insert(valid.map(({quote_text,override_date,month_day,active})=>({quote_text,override_date,month_day,active,source:"csv"}))); if(result.error)notify(result.error.message); else { notify(`${valid.length} frases importadas.`); setCsvRows([]); await load(); } setBusy(false); }

  return <section className={`card pad ${styles.quoteAdmin}`}>
    <header className={styles.compactHead}><h2>Inicio · Frases diarias</h2><p>Una frase estable por persona y día. Editar el catálogo no cambia una frase ya asignada.</p></header>
    <div className={styles.quoteForm}>
      <textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder="Frase diaria" aria-label="Frase diaria" />
      <label className="field"><span>Fecha concreta</span><input type="date" value={date} onChange={(e)=>{setDate(e.target.value);if(e.target.value)setMonthDay("");}} /></label>
      <label className="field"><span>Repite MM-DD</span><input value={monthDay} onChange={(e)=>{setMonthDay(e.target.value);if(e.target.value)setDate("");}} placeholder="08-12" inputMode="numeric" /></label>
      <label className="field"><span>Estado</span><select value={active?"1":"0"} onChange={(e)=>setActive(e.target.value==="1")}><option value="1">Activa</option><option value="0">Inactiva</option></select></label>
      <button className="btn" type="button" disabled={busy} onClick={()=>void save()}><Save /> {editId?"Guardar":"Crear"}</button>
      {editId?<button className="btn ghost" type="button" onClick={reset}><X /> Cancelar</button>:null}
    </div>
    <div className={styles.quoteToolbar}>
      <label className="field"><span>Previsualizar fecha</span><input type="date" value={previewDate} onChange={(e)=>setPreviewDate(e.target.value)} /></label>
      <button className="btn ghost" type="button" onClick={()=>void runPreview()}><Eye /> Previsualizar</button>
      <label className="btn ghost"><FileUp /> Importar CSV<input className={styles.fileInput} type="file" accept=".csv,text/csv" onChange={(e)=>void readCsv(e)} hidden /></label>
    </div>
    {preview?<div className={styles.preview}><strong>{preview.assigned?"Asignada":"Previsualización"} · {preview.selection_kind}</strong><div>{preview.text}</div></div>:null}
    {csvRows.length?<div className={styles.csvPreview}><table><thead><tr><th>Frase</th><th>Programación</th><th>Estado</th></tr></thead><tbody>{csvRows.map((row,index)=><tr key={`${row.quote_text}-${index}`}><td>{row.quote_text}</td><td>{row.override_date??row.month_day??"Rotación"}</td><td className={row.status==="new"?styles.statusOk:styles.statusBad}>{row.reason}</td></tr>)}</tbody></table><div className="actions"><button className="btn" type="button" disabled={busy||!csvRows.some((row)=>row.status==="new")} onClick={()=>void importCsv()}><Plus /> Importar válidas</button><button className="btn ghost" type="button" onClick={()=>setCsvRows([])}><X /> Cerrar</button></div></div>:null}
    <div className={styles.quoteList}>{quotes.map((quote)=><div className={styles.quoteRow} key={quote.id}><div><div className={styles.quoteText}>{quote.quote_text}</div><div className={styles.quoteMeta}>{quote.active?"Activa":"Inactiva"} · {quote.override_date?`Fecha ${quote.override_date}`:quote.month_day?`Cada ${quote.month_day}`:"Rotación"} · {used.has(quote.id)?"Con historial":"Sin uso"}</div></div><div className={styles.quoteActions}><button className="icon-btn" type="button" aria-label={`Editar ${quote.quote_text}`} onClick={()=>edit(quote)}><Pencil /></button><button className="icon-btn" type="button" aria-label={`${quote.active?"Desactivar":"Activar"} ${quote.quote_text}`} onClick={()=>void toggle(quote)}>{quote.active?"On":"Off"}</button><button className="icon-btn" type="button" aria-label={`Eliminar ${quote.quote_text}`} disabled={used.has(quote.id)||busy} onClick={()=>void remove(quote)}><Trash2 /></button></div></div>)}</div>
  </section>;
}
