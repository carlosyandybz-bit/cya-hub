"use client";

import { Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2, Copy, EyeOff, Plus, Save, Star, UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveStatisticsDashboard,
  makeStatisticsDashboardGlobalDefault,
  publishStatisticsDashboard,
  saveStatisticsDashboardDetails,
  setStatisticsDashboardAssignment,
} from "./statistics-admin-actions";
import { createStatisticsDashboardDraft } from "./statistics-dashboard-drafts";
import { StatisticsDashboardPreview } from "./statistics-dashboard-preview";
import { statisticBlockLabels, statisticCatalog, statisticCatalogByKey, type StatisticMetric } from "./statistics-catalog";

type Dashboard={id:number;name:string;description:string|null;scope:"global"|"teacher"|"personal";target_user_id:string|null;active:boolean;is_default:boolean};
type Card={id:number;dashboard_id:number;title:string;metric_key:string;period_kind:string;period_days:number|null;filters:Record<string,unknown>;comparison_kind:"none"|"previous_period"|"previous_year";display_kind:string;position:number;width:"small"|"medium"|"large"|"full";active:boolean};
type Profile={id:string;display_name:string};
type MemberRole={user_id:string;role:string;active:boolean};
type Person={id:number;display_name:string;active:boolean};
type Term={id:number;label:string};
type Campaign={id:number;title:string};
type Assignment={dashboard_id:number;user_id:string;is_default:boolean;active:boolean};
type MetricSetting={metric_key:string;active:boolean;featured:boolean;sort_order:number};

const periodLabels:Record<string,string>={today:"Hoy",this_week:"Esta semana",this_month:"Este mes",this_year:"Este año",rolling_days:"Últimos N días",custom:"Intervalo personalizado"};
const comparisonLabels:Record<Card["comparison_kind"],string>={none:"Sin comparación",previous_period:"Periodo anterior",previous_year:"Año anterior"};
const widthLabels:Record<Card["width"],string>={small:"Pequeña",medium:"Mediana",large:"Grande",full:"Ancho completo"};
const teacherRoles=new Set(["teacher","teacher_admin","admin"]);

function cleanFilters(metric:StatisticMetric,values:Record<string,string>,periodKind:string){
  const result:Record<string,unknown>={};
  for(const key of metric.filters){const value=(values[key]??"").trim();if(value)result[key]=value;}
  if(metric.filters.includes("payment_status")&&!result.payment_status)result.payment_status="paid";
  if(result.class_location&&!result.location_scope)result.location_scope="inside";
  if(periodKind==="custom"){
    if(values.period_from)result.period_from=values.period_from;
    if(values.period_to)result.period_to=values.period_to;
  }
  return result;
}
function messageFrom(error:unknown){return error instanceof Error?error.message:"No se ha podido completar la operación.";}

export function AdminStatistics({client,notify}:{client:SupabaseClient;notify:(message:string)=>void}){
  const [metricSettings,setMetricSettings]=useState<MetricSetting[]>([]),[dashboards,setDashboards]=useState<Dashboard[]>([]),[cards,setCards]=useState<Card[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[roles,setRoles]=useState<MemberRole[]>([]),[people,setPeople]=useState<Person[]>([]),[styles,setStyles]=useState<Term[]>([]),[campaigns,setCampaigns]=useState<Campaign[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]);
  const [selected,setSelected]=useState<number|null>(null),[quickPeriods,setQuickPeriods]=useState("7,30,90,365"),[busy,setBusy]=useState(false);
  const [newName,setNewName]=useState(""),[newScope,setNewScope]=useState<Dashboard["scope"]>("global"),[newTeacher,setNewTeacher]=useState("");
  const [panelNameDraft,setPanelNameDraft]=useState(""),[panelDescriptionDraft,setPanelDescriptionDraft]=useState("");
  const [metricKey,setMetricKey]=useState(statisticCatalog[0]?.key??""),[cardTitle,setCardTitle]=useState(""),[periodKind,setPeriodKind]=useState("this_month"),[periodDays,setPeriodDays]=useState("30"),[comparisonKind,setComparisonKind]=useState<Card["comparison_kind"]>("none"),[displayMode,setDisplayMode]=useState<"value"|"trend">("value"),[cardWidth,setCardWidth]=useState<Card["width"]>("small"),[filterValues,setFilterValues]=useState<Record<string,string>>({payment_status:"paid",location_scope:"inside"});

  const load=useCallback(async()=>{
    const [d,c,p,r,pe,t,mc,a,s,ms]=await Promise.all([
      client.from("statistics_dashboards").select("id,name,description,scope,target_user_id,active,is_default").order("active",{ascending:false}).order("is_default",{ascending:false}).order("name"),
      client.from("statistics_dashboard_cards").select("id,dashboard_id,title,metric_key,period_kind,period_days,filters,comparison_kind,display_kind,position,width,active").eq("active",true).order("position"),
      client.from("user_profiles").select("id,display_name").order("display_name"),
      client.from("app_member_roles").select("user_id,role,active").eq("active",true),
      client.from("people").select("id,display_name,active").eq("active",true).order("display_name"),
      client.from("catalog_terms").select("id,label").eq("taxonomy","dance_style").eq("active",true).order("sort_order"),
      client.from("marketing_campaigns").select("id,title").order("created_at",{ascending:false}),
      client.from("statistics_dashboard_assignments").select("dashboard_id,user_id,is_default,active"),
      client.from("statistics_settings").select("quick_periods").eq("singleton",true).maybeSingle(),
      client.from("statistics_metric_settings").select("metric_key,active,featured,sort_order")
    ]);
    const error=[d,c,p,r,pe,t,mc,a,s,ms].find((result)=>result.error)?.error;
    if(error){notify(error.message);return;}
    const nextDashboards=(d.data??[]) as Dashboard[];
    setDashboards(nextDashboards);setCards((c.data??[]) as Card[]);setProfiles((p.data??[]) as Profile[]);setRoles((r.data??[]) as MemberRole[]);setPeople((pe.data??[]) as Person[]);setStyles((t.data??[]) as Term[]);setCampaigns((mc.data??[]) as Campaign[]);setAssignments((a.data??[]) as Assignment[]);setMetricSettings((ms.data??[]) as MetricSetting[]);
    if(s.data?.quick_periods)setQuickPeriods((s.data.quick_periods as number[]).join(","));
    setSelected((value)=>nextDashboards.some((dashboard)=>dashboard.id===value)?value:(nextDashboards[0]?.id??null));
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  const selectedDashboard=dashboards.find((dashboard)=>dashboard.id===selected)??null;
  const selectedCards=cards.filter((card)=>card.dashboard_id===selected).sort((a,b)=>a.position-b.position||a.id-b.id);
  const selectedMetric=statisticCatalogByKey.get(metricKey)??statisticCatalog[0];
  const settingsMap=useMemo(()=>new Map(metricSettings.map((item)=>[item.metric_key,item])),[metricSettings]);
  const grouped=useMemo(()=>statisticCatalog.reduce<Record<string,StatisticMetric[]>>((all,metric)=>({...all,[metric.block]:[...(all[metric.block]??[]),metric]}),{}),[]);
  const teacherIds=useMemo(()=>new Set(roles.filter((role)=>teacherRoles.has(role.role)).map((role)=>role.user_id)),[roles]);
  const teachers=useMemo(()=>profiles.filter((profile)=>teacherIds.has(profile.id)),[profiles,teacherIds]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{setPanelNameDraft(selectedDashboard?.name??"");setPanelDescriptionDraft(selectedDashboard?.description??"");},0);
    return()=>window.clearTimeout(timer);
  },[selectedDashboard?.id,selectedDashboard?.name,selectedDashboard?.description]);

  function setFilter(key:string,value:string){setFilterValues((current)=>({...current,[key]:value}));}
  function resetCardForm(){setCardTitle("");setPeriodKind("this_month");setPeriodDays("30");setComparisonKind("none");setDisplayMode("value");setCardWidth("small");setFilterValues({payment_status:"paid",location_scope:"inside"});}

  async function createDashboard(){
    setBusy(true);
    try{const id=await createStatisticsDashboardDraft(client,newName,newScope,newScope==="global"?null:newTeacher);setNewName("");await load();setSelected(id);notify("Panel creado como borrador. Configúralo antes de publicarlo.");}
    catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function savePanelDetails(){
    if(!selectedDashboard)return;setBusy(true);
    try{await saveStatisticsDashboardDetails(client,selectedDashboard.id,panelNameDraft,panelDescriptionDraft);await load();notify("Panel actualizado.");}
    catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function publishPanel(){
    if(!selectedDashboard)return;setBusy(true);
    try{
      const shouldDefault=selectedDashboard.scope==="global"&&!dashboards.some((dashboard)=>dashboard.active&&dashboard.scope==="global"&&dashboard.is_default);
      await publishStatisticsDashboard(client,selectedDashboard.id,shouldDefault||selectedDashboard.is_default);await load();notify(shouldDefault?"Panel publicado y marcado como global por defecto.":"Panel publicado.");
    }catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function archivePanel(){
    if(!selectedDashboard)return;setBusy(true);
    try{
      const wasDefault=selectedDashboard.is_default;await archiveStatisticsDashboard(client,selectedDashboard.id);
      if(wasDefault){const replacement=dashboards.find((dashboard)=>dashboard.id!==selectedDashboard.id&&dashboard.active&&dashboard.scope==="global");if(replacement)await makeStatisticsDashboardGlobalDefault(client,replacement.id);}
      await load();notify("Panel archivado. Conserva todas sus tarjetas.");
    }catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function setGlobalDefault(){
    if(!selectedDashboard||selectedDashboard.scope!=="global")return;if(!selectedDashboard.active){notify("Publica el panel antes de marcarlo como predeterminado.");return;}setBusy(true);
    try{await makeStatisticsDashboardGlobalDefault(client,selectedDashboard.id);await load();notify("Panel global por defecto actualizado.");}
    catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function assignTeacher(userId:string){
    if(!selectedDashboard)return;if(selectedDashboard.target_user_id===userId){notify("Ese profesor es el destinatario principal del panel.");return;}
    const existing=assignments.find((assignment)=>assignment.dashboard_id===selectedDashboard.id&&assignment.user_id===userId&&assignment.active);setBusy(true);
    try{await setStatisticsDashboardAssignment(client,selectedDashboard.id,userId,!existing);await load();notify(existing?"Asignación retirada.":"Panel asignado a ese profesor.");}
    catch(error){notify(messageFrom(error));}
    setBusy(false);
  }

  async function addCard(){
    if(!selectedDashboard||!selectedMetric)return;
    if(periodKind==="rolling_days"&&(!Number.isInteger(Number(periodDays))||Number(periodDays)<1||Number(periodDays)>3650)){notify("El número de días no es válido.");return;}
    if(periodKind==="custom"&&(!filterValues.period_from||!filterValues.period_to||filterValues.period_from>=filterValues.period_to)){notify("Define un intervalo personalizado válido.");return;}
    const filters=cleanFilters(selectedMetric,filterValues,periodKind);
    const payload={dashboard_id:selectedDashboard.id,title:cardTitle.trim()||selectedMetric.label,metric_key:selectedMetric.key,period_kind:periodKind,period_days:periodKind==="rolling_days"?Number(periodDays):null,filters,comparison_kind:comparisonKind,display_kind:displayMode==="trend"?"trend":selectedMetric.format,position:selectedCards.length*10+10,width:cardWidth,active:true};
    setBusy(true);const result=await client.from("statistics_dashboard_cards").insert(payload);
    if(result.error)notify(result.error.message);else{resetCardForm();await load();notify("Tarjeta añadida.");}setBusy(false);
  }

  async function hideCard(id:number){setBusy(true);const result=await client.from("statistics_dashboard_cards").update({active:false,updated_at:new Date().toISOString()}).eq("id",id);if(result.error)notify(result.error.message);else{await load();notify("Tarjeta retirada del panel.");}setBusy(false);}

  async function moveCard(id:number,direction:-1|1){
    const index=selectedCards.findIndex((card)=>card.id===id),target=index+direction;if(index<0||target<0||target>=selectedCards.length)return;
    const reordered=[...selectedCards];[reordered[index],reordered[target]]=[reordered[target],reordered[index]];setBusy(true);
    const results=await Promise.all(reordered.map((card,position)=>client.from("statistics_dashboard_cards").update({position:(position+1)*10,updated_at:new Date().toISOString()}).eq("id",card.id)));
    const error=results.find((result)=>result.error)?.error;if(error)notify(error.message);else{await load();notify("Orden de tarjetas actualizado.");}setBusy(false);
  }

  async function toggleMetric(metric:StatisticMetric,field:"active"|"featured"){
    const current=settingsMap.get(metric.key)??{metric_key:metric.key,active:true,featured:false,sort_order:0};
    const result=await client.from("statistics_metric_settings").upsert({...current,[field]:!current[field],updated_at:new Date().toISOString()});if(result.error)notify(result.error.message);else await load();
  }

  async function savePeriods(){const values=[...new Set(quickPeriods.split(",").map((value)=>Number(value.trim())).filter((value)=>Number.isInteger(value)&&value>=1&&value<=3650))];if(!values.length){notify("Añade al menos un periodo válido.");return;}const result=await client.from("statistics_settings").update({quick_periods:values,updated_at:new Date().toISOString()}).eq("singleton",true);if(result.error)notify(result.error.message);else notify("Periodos rápidos guardados.");}

  async function duplicateDashboard(){
    if(!selectedDashboard)return;setBusy(true);
    const duplicate=await client.from("statistics_dashboards").insert({name:`${selectedDashboard.name} · copia`,description:selectedDashboard.description,scope:selectedDashboard.scope,target_user_id:selectedDashboard.target_user_id,active:false,is_default:false}).select("id").single();
    if(duplicate.error)notify(duplicate.error.message);
    else{
      const source=selectedCards.map((card,index)=>({dashboard_id:duplicate.data.id,title:card.title,metric_key:card.metric_key,period_kind:card.period_kind,period_days:card.period_days,filters:card.filters,comparison_kind:card.comparison_kind,display_kind:card.display_kind,position:index*10+10,width:card.width,active:true}));
      if(source.length){const copied=await client.from("statistics_dashboard_cards").insert(source);if(copied.error)notify(copied.error.message);}
      setSelected(duplicate.data.id);await load();notify("Panel duplicado como borrador.");
    }
    setBusy(false);
  }

  function filterEditor(){
    if(!selectedMetric)return null;const has=(key:string)=>selectedMetric.filters.includes(key as never);
    return <div className="form-row statistics-filter-row">
      {has("teacher")?<label className="field"><span>Profesor</span><select value={filterValues.teacher??""} onChange={(e)=>setFilter("teacher",e.target.value)}><option value="">Todos</option>{teachers.map((teacher)=><option key={teacher.id} value={teacher.id}>{teacher.display_name}</option>)}</select></label>:null}
      {has("student")?<label className="field"><span>Alumno</span><select value={filterValues.student??""} onChange={(e)=>setFilter("student",e.target.value)}><option value="">Todos</option>{people.map((person)=><option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>:null}
      {has("style")?<label className="field"><span>Estilo</span><select value={filterValues.style??""} onChange={(e)=>setFilter("style",e.target.value)}><option value="">Todos</option>{styles.map((style)=><option key={style.id} value={style.id}>{style.label}</option>)}</select></label>:null}
      {has("campaign")?<label className="field"><span>Campaña</span><select value={filterValues.campaign??""} onChange={(e)=>setFilter("campaign",e.target.value)}><option value="">Todas</option>{campaigns.map((campaign)=><option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>:null}
      {has("class_location")?<label className="field"><span>Ubicación</span><input value={filterValues.class_location??""} onChange={(e)=>setFilter("class_location",e.target.value)} placeholder="Ej. Málaga"/></label>:null}
      {has("location_scope")&&filterValues.class_location?<label className="field"><span>Ámbito</span><select value={filterValues.location_scope??"inside"} onChange={(e)=>setFilter("location_scope",e.target.value)}><option value="inside">En esta ubicación</option><option value="outside">Fuera de esta ubicación</option></select></label>:null}
      {has("class_status")?<label className="field"><span>Estado de clase</span><select value={filterValues.class_status??""} onChange={(e)=>setFilter("class_status",e.target.value)}><option value="">Todos</option><option value="scheduled">Programada</option><option value="active">Activa</option><option value="finished">Terminada</option><option value="cancelled">Cancelada</option></select></label>:null}
      {has("country")?<label className="field"><span>País</span><input value={filterValues.country??""} maxLength={2} onChange={(e)=>setFilter("country",e.target.value.toUpperCase())} placeholder="ES"/></label>:null}
      {has("payment_status")?<label className="field"><span>Pago</span><select value={filterValues.payment_status??"paid"} onChange={(e)=>setFilter("payment_status",e.target.value)}><option value="paid">Cobrado</option><option value="pending">Pendiente</option><option value="refunded">Devuelto</option></select></label>:null}
      {has("content_type")?<label className="field"><span>Contenido</span><select value={filterValues.content_type??""} onChange={(e)=>setFilter("content_type",e.target.value)}><option value="">Todos</option><option value="correction">Correcciones</option><option value="explanation">Explicaciones</option><option value="exercise">Ejercicios</option><option value="sequence">Secuencias</option></select></label>:null}
      {has("mission_type")?<label className="field"><span>Tipo de misión</span><select value={filterValues.mission_type??""} onChange={(e)=>setFilter("mission_type",e.target.value)}><option value="">Todas</option><option value="primary">Principal</option><option value="daily">Diaria</option><option value="growth">Crecimiento</option></select></label>:null}
      {has("priority")?<label className="field"><span>Prioridad</span><select value={filterValues.priority??""} onChange={(e)=>setFilter("priority",e.target.value)}><option value="">Todas</option><option value="normal">Normal</option><option value="priority">Prioritaria</option><option value="urgent">Urgente</option></select></label>:null}
      {has("channel")?<label className="field"><span>Canal</span><select value={filterValues.channel??""} onChange={(e)=>setFilter("channel",e.target.value)}><option value="">Todos</option><option value="internal">Interno</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="system">Sistema</option></select></label>:null}
      {has("event_key")?<label className="field"><span>Tipo de aviso</span><input value={filterValues.event_key??""} onChange={(e)=>setFilter("event_key",e.target.value)} placeholder="Evento opcional"/></label>:null}
    </div>;
  }

  return <section className="admin-stack statistics-admin">
    <header className="admin-section-head"><div><h2>Estadísticas</h2><p>Decide qué ve cada profesor y combina métricas, periodos, comparaciones y filtros sin duplicar datos.</p></div><BarChart3/></header>
    <article className="card pad"><div className="card-head"><h2>Periodos rápidos</h2><Save/></div><p className="muted">Días separados por comas. Cada tarjeta también puede usar Hoy, Semana, Mes, Año o un intervalo personalizado.</p><div className="form-row"><input value={quickPeriods} onChange={(e)=>setQuickPeriods(e.target.value)} placeholder="7,30,90,365"/><button className="btn" onClick={()=>void savePeriods()}><Save/>Guardar</button></div></article>
    <article className="card pad"><div className="card-head"><h2>Crear panel</h2><Plus/></div><p className="muted">Los paneles nuevos nacen como borradores para que puedas configurarlos antes de publicarlos.</p><div className="form-row"><input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="Ej. Mi semana"/><select value={newScope} onChange={(e)=>setNewScope(e.target.value as Dashboard["scope"])}><option value="global">Todos los profesores</option><option value="teacher">Profesor concreto</option><option value="personal">Personal de un profesor</option></select>{newScope!=="global"?<select value={newTeacher} onChange={(e)=>setNewTeacher(e.target.value)}><option value="">Elegir profesor</option>{teachers.map((teacher)=><option key={teacher.id} value={teacher.id}>{teacher.display_name}</option>)}</select>:null}<button className="btn" disabled={busy} onClick={()=>void createDashboard()}><Plus/>Crear borrador</button></div></article>
    <div className="admin-content-grid"><article className="card pad"><div className="card-head"><h2>Paneles guardados</h2><span>{dashboards.length}</span></div><div className="term-list">{dashboards.map((dashboard)=><button key={dashboard.id} className={selected===dashboard.id?"active":""} onClick={()=>setSelected(dashboard.id)}><strong>{dashboard.name}</strong><small>{dashboard.scope==="global"?"Todos":dashboard.scope==="personal"?"Personal":"Profesor"} · {dashboard.active?"Publicado":"Borrador / archivado"}{dashboard.is_default?" · Predeterminado":""}</small></button>)}</div></article>
    <article className="card pad"><div className="card-head"><h2>{selectedDashboard?.name??"Selecciona un panel"}</h2>{selectedDashboard?<span>{selectedDashboard.active?"Publicado":"Inactivo"}</span>:null}</div>{selectedDashboard?<><div className="form-row"><label className="field"><span>Nombre</span><input value={panelNameDraft} onChange={(e)=>setPanelNameDraft(e.target.value)}/></label><label className="field"><span>Descripción</span><input value={panelDescriptionDraft} onChange={(e)=>setPanelDescriptionDraft(e.target.value)} placeholder="Descripción opcional"/></label><button className="btn ghost" disabled={busy} onClick={()=>void savePanelDetails()}><Save/>Guardar datos</button></div><div className="actions"><StatisticsDashboardPreview client={client} dashboardName={selectedDashboard.name} cards={selectedCards} notify={notify}/><button className="btn ghost" disabled={busy} onClick={()=>void duplicateDashboard()}><Copy/>Duplicar</button>{selectedDashboard.active?<button className="btn ghost" disabled={busy} onClick={()=>void archivePanel()}><Archive/>Archivar</button>:<button className="btn" disabled={busy} onClick={()=>void publishPanel()}><CheckCircle2/>Publicar</button>}{selectedDashboard.scope==="global"?<button className="btn ghost" disabled={busy||selectedDashboard.is_default} onClick={()=>void setGlobalDefault()}><Star/>{selectedDashboard.is_default?"Global por defecto":"Hacer global por defecto"}</button>:null}</div>{selectedDashboard.scope==="teacher"?<div><p className="muted"><UsersRound/> El profesor principal pertenece al panel; las asignaciones adicionales se pueden activar o retirar tocando su nombre.</p><div className="role-chip-list">{teachers.map((teacher)=>{const primary=selectedDashboard.target_user_id===teacher.id;const assigned=assignments.some((assignment)=>assignment.active&&assignment.dashboard_id===selectedDashboard.id&&assignment.user_id===teacher.id);return <button key={teacher.id} className={primary||assigned?"active":""} disabled={busy||primary} onClick={()=>void assignTeacher(teacher.id)}>{teacher.display_name}{primary?" · principal":assigned?" · asignado":""}</button>;})}</div></div>:null}<div className="term-list">{selectedCards.map((card,index)=><div key={card.id}><span><strong>{card.title}</strong><small>{periodLabels[card.period_kind]??card.period_kind} · {comparisonLabels[card.comparison_kind]} · {widthLabels[card.width]}{card.filters.class_location?` · ${card.filters.location_scope==="outside"?"fuera de ":""}${String(card.filters.class_location)}`:""}</small></span><span className="actions"><button className="icon-btn" aria-label={`Subir ${card.title}`} disabled={busy||index===0} onClick={()=>void moveCard(card.id,-1)}><ArrowUp/></button><button className="icon-btn" aria-label={`Bajar ${card.title}`} disabled={busy||index===selectedCards.length-1} onClick={()=>void moveCard(card.id,1)}><ArrowDown/></button><button className="icon-btn" aria-label={`Retirar ${card.title}`} disabled={busy} onClick={()=>void hideCard(card.id)}><EyeOff/></button></span></div>)}</div></>:null}</article></div>
    {selectedDashboard&&selectedMetric?<article className="card pad"><div className="card-head"><h2>Añadir tarjeta</h2><Plus/></div><div className="form-row"><select value={metricKey} onChange={(e)=>{setMetricKey(e.target.value);setFilterValues({payment_status:"paid",location_scope:"inside"});setDisplayMode("value");}}>{Object.entries(grouped).map(([block,items])=><optgroup key={block} label={statisticBlockLabels[block as keyof typeof statisticBlockLabels]??block}>{items.filter((metric)=>settingsMap.get(metric.key)?.active!==false).map((metric)=><option key={metric.key} value={metric.key}>{metric.label}</option>)}</optgroup>)}</select><input value={cardTitle} onChange={(e)=>setCardTitle(e.target.value)} placeholder="Título opcional"/><select value={periodKind} onChange={(e)=>setPeriodKind(e.target.value)}>{Object.entries(periodLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{periodKind==="rolling_days"?<input type="text" inputMode="numeric" pattern="[0-9]*" value={periodDays} onChange={(e)=>setPeriodDays(e.target.value)} aria-label="Número de días"/>:null}<select value={comparisonKind} onChange={(e)=>setComparisonKind(e.target.value as Card["comparison_kind"])}>{Object.entries(comparisonLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select value={displayMode} onChange={(e)=>setDisplayMode(e.target.value as "value"|"trend")}><option value="value">Valor</option><option value="trend">Tendencia</option></select><select value={cardWidth} onChange={(e)=>setCardWidth(e.target.value as Card["width"])}>{Object.entries(widthLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{periodKind==="custom"?<><label className="field"><span>Desde</span><input type="date" value={filterValues.period_from??""} onChange={(e)=>setFilter("period_from",e.target.value)}/></label><label className="field"><span>Hasta</span><input type="date" value={filterValues.period_to??""} onChange={(e)=>setFilter("period_to",e.target.value)}/></label></>:null}</div>{filterEditor()}<p className="muted">{selectedMetric.description}</p><button className="btn" disabled={busy} onClick={()=>void addCard()}><Plus/>Añadir tarjeta</button></article>:null}
    <article className="card pad"><div className="card-head"><h2>Catálogo de métricas</h2><Star/></div>{Object.entries(grouped).map(([block,items])=><div key={block}><h3>{statisticBlockLabels[block as keyof typeof statisticBlockLabels]??block}</h3><div className="role-chip-list">{items.map((metric)=>{const setting=settingsMap.get(metric.key);return <div key={metric.key}><span>{metric.label}</span><button className={setting?.active===false?"":"active"} onClick={()=>void toggleMetric(metric,"active")}>{setting?.active===false?"Oculta":"Disponible"}</button><button className={setting?.featured?"active":""} onClick={()=>void toggleMetric(metric,"featured")}><Star/>Preferente</button></div>;})}</div></div>)}</article>
  </section>;
}
