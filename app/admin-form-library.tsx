"use client";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronDown, ChevronRight, CopyPlus, FilePlus2, FileText, Plus, Save, Settings2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type FormDefinition = {
  id:number; form_key:string; admin_name:string; visible_title:string|null; description:string|null;
  context_key:string; form_type:string; status:string; active_version:number; settings:Record<string,unknown>;
};
type FormVersion = { id:number; form_id:number; version_number:number; status:string; change_note:string|null };
type FormField = {
  id:number; form_version_id:number; field_key:string; field_type:string; label:string; help_text:string|null;
  required:boolean; canonical_path:string|null; sort_order:number; active:boolean;
  options:unknown; visibility:Record<string,unknown>; condition:Record<string,unknown>; validation:Record<string,unknown>;
};

type Props = { client: SupabaseClient; notify: (message:string)=>void };
type EngineState = "checking" | "ready" | "pending";

const fieldTypes = [
  ["information","Información"],["text","Texto"],["textarea","Texto largo"],["select","Selección"],
  ["multiselect","Selección múltiple"],["checkbox","Casilla"],["number","Número"],["date","Fecha"],
  ["email","Email"],["phone","Teléfono"],
] as const;
const canonicalPaths = [
  ["","Respuesta específica del formulario"],
  ["people.first_name","Nombre"],["people.last_name","Apellidos"],["people.email","Email"],["people.phone","Teléfono"],["people.country_code","País"],
  ["student_profiles.birth_date","Fecha de nacimiento"],["student_profiles.goals","Objetivos"],["student_profiles.motivation","Motivación"],
  ["student_profiles.health_notes","Salud / a tener en cuenta"],["student_profiles.teacher_notes","Notas internas del profesor"],
] as const;

function isMissingRuntime(error: PostgrestError | null) {
  if (!error) return false;
  const message=String(error.message??"").toLowerCase();
  return error.code==="PGRST202" || (message.includes("form_runtime") && (message.includes("could not find")||message.includes("schema cache")));
}
function jsonRecord(value:unknown):Record<string,unknown>{ return value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
function jsonArray(value:unknown):unknown[]{ return Array.isArray(value) ? value : []; }
function prettyOptions(value:unknown){ return jsonArray(value).map((item)=>typeof item==="object"&&item!==null&&"label" in item?String((item as {label?:unknown}).label??""):String(item)).filter(Boolean).join("\n"); }
function visibilityPreset(value:Record<string,unknown>){
  const audiences=Array.isArray(value.audiences)?value.audiences.map(String):[];
  const editable=Array.isArray(value.editable_by)?value.editable_by.map(String):[];
  if(audiences.includes("staff")&&!audiences.includes("student")) return "staff";
  if(audiences.includes("student")&&editable.includes("staff")&&!editable.includes("student")) return "student_read";
  return "student_edit";
}
function visibilityFor(preset:string){
  if(preset==="staff") return {audiences:["staff"],editable_by:["staff"]};
  if(preset==="student_read") return {audiences:["student","staff"],editable_by:["staff"]};
  return {audiences:["student","staff"],editable_by:["student","staff"]};
}
function conditionParts(value:Record<string,unknown>){ return {field:typeof value.field==="string"?value.field:"",operator:typeof value.operator==="string"?value.operator:"eq",value:value.value==null?"":Array.isArray(value.value)?value.value.join(", "):String(value.value)}; }
function validationPart(value:Record<string,unknown>,key:string){ const raw=value[key]; return typeof raw==="number"||typeof raw==="string"?String(raw):""; }

export function AdminFormLibrary({ client, notify }: Props) {
  const [forms,setForms]=useState<FormDefinition[]>([]), [versions,setVersions]=useState<FormVersion[]>([]), [fields,setFields]=useState<FormField[]>([]);
  const [selectedId,setSelectedId]=useState<number|null>(null), [busy,setBusy]=useState(""), [loading,setLoading]=useState(true);
  const [engine,setEngine]=useState<EngineState>("checking"), [showCreate,setShowCreate]=useState(false), [showAddField,setShowAddField]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const [f,v,ff]=await Promise.all([
      client.from("form_definitions").select("id,form_key,admin_name,visible_title,description,context_key,form_type,status,active_version,settings").order("admin_name"),
      client.from("form_versions").select("id,form_id,version_number,status,change_note").order("version_number",{ascending:false}),
      client.from("form_fields").select("id,form_version_id,field_key,field_type,label,help_text,required,canonical_path,sort_order,active,options,visibility,condition,validation").order("sort_order"),
    ]);
    const error=f.error||v.error||ff.error;
    if(error) notify(error.message);
    setForms((f.data??[]) as FormDefinition[]); setVersions((v.data??[]) as FormVersion[]); setFields((ff.data??[]) as FormField[]);
    setSelectedId((current)=>current??((f.data?.[0] as FormDefinition|undefined)?.id??null)); setLoading(false);
  },[client,notify]);

  const checkEngine=useCallback(async()=>{
    const result=await client.rpc("form_runtime",{p_form_key:"student_personal",p_person_id:null,p_mode:"review"});
    if(!result.error){setEngine("ready");return;}
    if(isMissingRuntime(result.error)){setEngine("pending");return;}
    setEngine("pending");
  },[client]);

  useEffect(()=>{const timer=window.setTimeout(()=>{void load();void checkEngine();},0);return()=>window.clearTimeout(timer);},[load,checkEngine]);

  const selected=forms.find((form)=>form.id===selectedId)??null;
  const activeVersion=selected?versions.find((version)=>version.form_id===selected.id&&version.version_number===selected.active_version)??null:null;
  const draftVersion=selected?versions.find((version)=>version.form_id===selected.id&&version.status==="draft")??null:null;
  const workingVersion=draftVersion??activeVersion;
  const workingFields=useMemo(()=>workingVersion?fields.filter((field)=>field.form_version_id===workingVersion.id).sort((a,b)=>a.sort_order-b.sort_order):[],[fields,workingVersion]);
  const generic=selected?.settings?.runtime_engine==="generic_v1";
  const domain=selected?.settings?.runtime_engine==="domain_service";
  const editable=engine==="ready"&&Boolean(generic)&&Boolean(draftVersion);

  async function createDraft(){ if(!selected||engine!=="ready"||!generic)return; setBusy("draft"); const r=await client.rpc("create_form_draft_version",{p_form_id:selected.id,p_change_note:`Nueva versión de ${selected.admin_name}`}); if(r.error)notify(r.error.message); else {await load();notify("Borrador creado. La versión publicada sigue intacta.");} setBusy(""); }
  async function publish(){ if(!selected||!draftVersion||engine!=="ready"||!generic)return; setBusy("publish"); const r=await client.rpc("publish_form_version",{p_form_id:selected.id,p_version_number:draftVersion.version_number}); if(r.error)notify(r.error.message); else {await load();notify(`Versión ${draftVersion.version_number} publicada.`);} setBusy(""); }
  async function toggleStatus(){ if(!selected||engine!=="ready"||!generic)return; setBusy("status"); const next=selected.status==="active"?"inactive":"active"; const r=await client.rpc("set_form_definition_status",{p_form_id:selected.id,p_status:next}); if(r.error)notify(r.error.message); else {await load();notify(next==="active"?"Formulario activado.":"Formulario pausado.");} setBusy(""); }
  async function updateField(field:FormField,changes:Record<string,unknown>){ if(!editable)return; setBusy(`field-${field.id}`); const r=await client.rpc("update_form_draft_field",{p_field_id:field.id,p_label:changes.label??field.label,p_help_text:changes.help_text===undefined?field.help_text:changes.help_text,p_required:changes.required??field.required,p_active:changes.active??field.active,p_sort_order:changes.sort_order??field.sort_order,p_options:null,p_visibility:null,p_condition:null,p_validation:null}); if(r.error)notify(r.error.message); else await load(); setBusy(""); }
  async function configureField(field:FormField,configuration:FieldConfiguration){ if(!editable)return; setBusy(`field-${field.id}`); const r=await client.rpc("configure_form_draft_field",{p_field_id:field.id,p_field_type:configuration.fieldType,p_canonical_path:configuration.canonicalPath||null,p_options:configuration.options,p_visibility:configuration.visibility,p_condition:configuration.condition,p_validation:configuration.validation}); if(r.error)notify(r.error.message); else {await load();notify(`Configuración de “${field.label}” guardada.`);} setBusy(""); }

  async function createGeneric(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(engine!=="ready")return; const form=new FormData(event.currentTarget); setBusy("create");
    const r=await client.rpc("create_generic_form",{p_form_key:String(form.get("form_key")??"").trim(),p_admin_name:String(form.get("admin_name")??"").trim(),p_visible_title:String(form.get("visible_title")??"").trim()||null,p_description:String(form.get("description")??"").trim()||null,p_context_key:String(form.get("context_key")??"custom").trim()||"custom",p_form_type:String(form.get("form_type")??"student")});
    if(r.error)notify(r.error.message); else {const row=(Array.isArray(r.data)?r.data[0]:r.data) as FormDefinition|null; await load(); if(row?.id)setSelectedId(row.id); setShowCreate(false); notify("Formulario creado como borrador.");} setBusy("");
  }

  async function addField(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(!selected||!draftVersion||!generic||engine!=="ready")return; const form=new FormData(event.currentTarget); setBusy("add-field");
    const type=String(form.get("field_type")??"text"), canonical=String(form.get("canonical_path")??"")||null;
    const r=await client.rpc("add_form_draft_field",{p_form_id:selected.id,p_field_key:String(form.get("field_key")??"").trim(),p_field_type:type,p_label:String(form.get("label")??"").trim(),p_help_text:String(form.get("help_text")??"").trim()||null,p_required:form.get("required")==="on",p_canonical_path:canonical,p_options:[],p_visibility:null,p_condition:{},p_validation:{},p_sort_order:Number(String(form.get("sort_order")??"100")||100)});
    if(r.error)notify(r.error.message); else {await load();setShowAddField(false);notify("Campo añadido al borrador.");} setBusy("");
  }

  if(loading)return <div className="compact-empty"><FileText/><span>Cargando biblioteca de formularios…</span></div>;
  return <div className="admin-split">
    <aside className="card admin-choice-list">
      <header><h2>Formularios</h2><span>{forms.length}</span></header>
      {engine==="ready"?<button className="admin-create-item" onClick={()=>setShowCreate((value)=>!value)}><FilePlus2/><span><strong>Nuevo formulario</strong><small>Crear formulario configurable</small></span><Plus/></button>:null}
      {forms.map((form)=><button key={form.id} className={selectedId===form.id?"active":""} onClick={()=>{setSelectedId(form.id);setShowAddField(false);}}><FileText/><span><strong>{form.admin_name}</strong><small>{form.context_key} · {form.status}{form.settings?.runtime_engine==="domain_service"?" · módulo propio":` · v${form.active_version}`}</small></span><ChevronRight/></button>)}
    </aside>
    <section className="card pad admin-form-editor">
      {engine==="pending"?<div className="notice"><strong>Edición avanzada no disponible</strong><span>La biblioteca se muestra temporalmente en modo lectura. Las fichas de alumnado siguen funcionando con normalidad.</span></div>:null}
      {showCreate&&engine==="ready"?<CreateFormPanel busy={busy==="create"} close={()=>setShowCreate(false)} submit={createGeneric}/>:null}
      {selected?<>
        <div className="card-head"><div><p className="eyebrow">{domain?"Gestionado por módulo":draftVersion?`Borrador v${draftVersion.version_number}`:`Publicada v${selected.active_version}`}</p><h2>{selected.visible_title||selected.admin_name}</h2></div>{engine==="ready"&&generic?<button type="button" className="btn ghost" disabled={busy==="status"} onClick={toggleStatus}>{selected.status==="active"?"Pausar":"Activar"}</button>:null}</div>
        {selected.description?<p className="admin-description">{selected.description}</p>:null}
        <div className="admin-read-list"><div><span>Estado</span><strong>{selected.status}</strong></div><div><span>Tipo</span><strong>{selected.form_type}</strong></div><div><span>Versión publicada</span><strong>v{selected.active_version}</strong></div></div>
        {domain?<div className="notice"><strong>Configurado desde su módulo</strong><span>Este formulario pertenece a una operación específica y se gestiona desde su sección correspondiente.</span></div>:null}
        {engine==="ready"&&generic?<div className="actions">{!draftVersion?<button type="button" className="btn" disabled={busy==="draft"} onClick={createDraft}><CopyPlus size={17}/>{busy==="draft"?"Creando…":"Crear nueva versión"}</button>:<><button type="button" className="btn ghost" onClick={()=>setShowAddField((value)=>!value)}><Plus size={17}/>Añadir campo</button><button type="button" className="btn" disabled={busy==="publish"} onClick={publish}><CheckCircle2 size={17}/>{busy==="publish"?"Publicando…":`Publicar v${draftVersion.version_number}`}</button></>}</div>:null}
        {engine==="ready"&&generic?<p className="modal-intro">{draftVersion?"Estás editando un borrador. Los envíos y la versión publicada no cambian hasta que pulses Publicar.":"La versión publicada es inmutable. Crea una nueva versión para cambiar campos."}</p>:null}
        {showAddField&&editable?<AddFieldPanel busy={busy==="add-field"} submit={addField} close={()=>setShowAddField(false)}/>:null}
        <div className="form-field-admin-list">{workingFields.map((field)=><FieldRow key={`${field.id}-${field.label}-${field.help_text??""}-${field.sort_order}-${field.required}-${field.active}-${JSON.stringify(field.options)}-${JSON.stringify(field.visibility)}-${JSON.stringify(field.condition)}-${JSON.stringify(field.validation)}`} field={field} editable={editable} busy={busy===`field-${field.id}`} availableFields={workingFields} save={(changes)=>updateField(field,changes)} configure={(configuration)=>configureField(field,configuration)}/>)}</div>
      </>:<div className="compact-empty"><FileText/><span>Selecciona un formulario.</span></div>}
    </section>
  </div>;
}

function CreateFormPanel({busy,close,submit}:{busy:boolean;close:()=>void;submit:(event:FormEvent<HTMLFormElement>)=>Promise<void>}){
  return <form className="card pad form" onSubmit={submit}><div className="card-head"><div><p className="eyebrow">Nuevo</p><h3>Formulario genérico</h3></div><button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X/></button></div><div className="fields-2"><label className="field"><span>Clave interna *</span><input name="form_key" pattern="[a-z][a-z0-9_]{2,63}" placeholder="feedback_clase" required/></label><label className="field"><span>Nombre interno *</span><input name="admin_name" required/></label><label className="field"><span>Título visible</span><input name="visible_title"/></label><label className="field"><span>Contexto</span><input name="context_key" defaultValue="custom"/></label><label className="field"><span>Tipo</span><select name="form_type" defaultValue="student"><option value="student">Alumno</option><option value="teacher">Profesor</option><option value="internal">Interno</option><option value="admin">Administración</option></select></label><label className="field field-wide"><span>Descripción</span><textarea name="description" rows={2}/></label></div><div className="actions"><button className="btn" disabled={busy}><FilePlus2 size={17}/>{busy?"Creando…":"Crear borrador"}</button></div></form>;
}

function AddFieldPanel({busy,close,submit}:{busy:boolean;close:()=>void;submit:(event:FormEvent<HTMLFormElement>)=>Promise<void>}){
  return <form className="card pad form" onSubmit={submit}><div className="card-head"><div><p className="eyebrow">Borrador</p><h3>Añadir campo</h3></div><button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X/></button></div><div className="fields-2"><label className="field"><span>Clave *</span><input name="field_key" pattern="[a-z][a-z0-9_]{1,63}" placeholder="observaciones" required/></label><label className="field"><span>Etiqueta *</span><input name="label" required/></label><label className="field"><span>Tipo</span><select name="field_type" defaultValue="text">{fieldTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Dato canónico</span><select name="canonical_path" defaultValue="">{canonicalPaths.map(([value,label])=><option key={value||"custom"} value={value}>{label}</option>)}</select></label><label className="field"><span>Orden</span><input name="sort_order" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="100"/></label><label className="field"><span>Obligatorio</span><input name="required" type="checkbox"/></label><label className="field field-wide"><span>Ayuda</span><input name="help_text"/></label></div><div className="actions"><button className="btn" disabled={busy}><Plus size={17}/>{busy?"Añadiendo…":"Añadir campo"}</button></div></form>;
}

type FieldConfiguration={fieldType:string;canonicalPath:string;options:unknown[];visibility:Record<string,unknown>;condition:Record<string,unknown>;validation:Record<string,unknown>};
function FieldRow({field,editable,busy,availableFields,save,configure}:{field:FormField;editable:boolean;busy:boolean;availableFields:FormField[];save:(changes:Record<string,unknown>)=>Promise<void>;configure:(configuration:FieldConfiguration)=>Promise<void>}){
  const [label,setLabel]=useState(field.label), [help,setHelp]=useState(field.help_text??""), [order,setOrder]=useState(String(field.sort_order)), [expanded,setExpanded]=useState(false);
  const [fieldType,setFieldType]=useState(field.field_type), [canonical,setCanonical]=useState(field.canonical_path??""), [options,setOptions]=useState(prettyOptions(field.options));
  const [visibility,setVisibility]=useState(visibilityPreset(jsonRecord(field.visibility)));
  const initialCondition=conditionParts(jsonRecord(field.condition));
  const [conditionField,setConditionField]=useState(initialCondition.field), [conditionOperator,setConditionOperator]=useState(initialCondition.operator), [conditionValue,setConditionValue]=useState(initialCondition.value);
  const validation=jsonRecord(field.validation);
  const [min,setMin]=useState(validationPart(validation,"min")), [max,setMax]=useState(validationPart(validation,"max")), [minLength,setMinLength]=useState(validationPart(validation,"min_length")), [maxLength,setMaxLength]=useState(validationPart(validation,"max_length")), [decimal,setDecimal]=useState(validation.decimal===true);

  function configuration():FieldConfiguration{
    const optionValues=options.split(/\r?\n|,/).map((item)=>item.trim()).filter(Boolean);
    const condition=conditionField?{field:conditionField,operator:conditionOperator,...(!["truthy","falsy"].includes(conditionOperator)?{value:conditionOperator==="in"?conditionValue.split(",").map((item)=>item.trim()).filter(Boolean):conditionValue}:{})}:{};
    const nextValidation:Record<string,unknown>={};
    if(min!=="")nextValidation.min=Number(min.replace(",",".")); if(max!=="")nextValidation.max=Number(max.replace(",","."));
    if(minLength!=="")nextValidation.min_length=Number(minLength); if(maxLength!=="")nextValidation.max_length=Number(maxLength); if(decimal)nextValidation.decimal=true;
    return {fieldType,canonicalPath:canonical,options:optionValues,visibility:visibilityFor(visibility),condition,validation:nextValidation};
  }

  if(!editable)return <div className={!field.active?"inactive":""}><span className="field-order">{field.sort_order}</span><span><strong>{field.label}</strong><small>{field.field_type}{field.canonical_path?` · reutiliza ${field.canonical_path}`:" · respuesta específica"}{field.required?" · obligatorio":""}</small></span></div>;
  return <div className={!field.active?"inactive":""}><span className="field-order">{field.sort_order}</span><span className="field"><input value={label} onChange={(event)=>setLabel(event.target.value)}/><input value={help} onChange={(event)=>setHelp(event.target.value)} placeholder="Ayuda opcional"/><small>{field.field_type}{field.canonical_path?` · ${field.canonical_path}`:" · respuesta específica"}</small></span><label><small>Obligatorio</small><input type="checkbox" checked={field.required} onChange={(event)=>void save({required:event.target.checked})}/></label><label><small>Activo</small><input type="checkbox" checked={field.active} onChange={(event)=>void save({active:event.target.checked})}/></label><span className="field"><small>Orden</small><input type="text" inputMode="numeric" pattern="[0-9]*" value={order} onChange={(event)=>setOrder(event.target.value.replace(/\D/g,""))}/></span><button type="button" className="icon-btn" disabled={busy||!label.trim()} aria-label={`Guardar ${field.label}`} onClick={()=>void save({label:label.trim(),help_text:help.trim()||null,sort_order:Number(order||0)})}><Save size={17}/></button><button type="button" className="icon-btn" aria-label={`Configurar ${field.label}`} onClick={()=>setExpanded((value)=>!value)}>{expanded?<ChevronDown size={17}/>:<Settings2 size={17}/>}</button>
  {expanded?<section className="field-wide card pad form"><div className="fields-2"><label className="field"><span>Tipo</span><select value={fieldType} onChange={(event)=>setFieldType(event.target.value)}>{fieldTypes.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label><label className="field"><span>Fuente del dato</span><select value={canonical} onChange={(event)=>setCanonical(event.target.value)}>{canonicalPaths.map(([value,text])=><option key={value||"custom"} value={value}>{text}</option>)}</select></label><label className="field"><span>Visibilidad</span><select value={visibility} onChange={(event)=>setVisibility(event.target.value)}><option value="student_edit">Alumno ve y puede editar</option><option value="student_read">Alumno ve · equipo edita</option><option value="staff">Solo equipo</option></select></label><label className="field"><span>Mostrar si…</span><select value={conditionField} onChange={(event)=>setConditionField(event.target.value)}><option value="">Siempre</option>{availableFields.filter((item)=>item.id!==field.id&&item.active).map((item)=><option key={item.id} value={item.field_key}>{item.label}</option>)}</select></label>{conditionField?<><label className="field"><span>Condición</span><select value={conditionOperator} onChange={(event)=>setConditionOperator(event.target.value)}><option value="eq">Es igual a</option><option value="neq">No es igual a</option><option value="truthy">Está marcado / tiene valor</option><option value="falsy">Está vacío / desmarcado</option><option value="in">Está entre</option></select></label>{!["truthy","falsy"].includes(conditionOperator)?<label className="field"><span>Valor</span><input value={conditionValue} onChange={(event)=>setConditionValue(event.target.value)} placeholder={conditionOperator==="in"?"uno, dos, tres":"valor"}/></label>:null}</>:null}{["select","multiselect"].includes(fieldType)?<label className="field field-wide"><span>Opciones</span><textarea rows={3} value={options} onChange={(event)=>setOptions(event.target.value)} placeholder={"Opción 1\nOpción 2"}/></label>:null}{fieldType==="number"?<><label className="field"><span>Mínimo</span><input type="text" inputMode="decimal" value={min} onChange={(event)=>setMin(event.target.value)}/></label><label className="field"><span>Máximo</span><input type="text" inputMode="decimal" value={max} onChange={(event)=>setMax(event.target.value)}/></label><label className="field"><span>Permitir decimales</span><input type="checkbox" checked={decimal} onChange={(event)=>setDecimal(event.target.checked)}/></label></>:null}{["text","textarea","email","phone"].includes(fieldType)?<><label className="field"><span>Longitud mínima</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={minLength} onChange={(event)=>setMinLength(event.target.value.replace(/\D/g,""))}/></label><label className="field"><span>Longitud máxima</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={maxLength} onChange={(event)=>setMaxLength(event.target.value.replace(/\D/g,""))}/></label></>:null}</div><div className="actions"><button type="button" className="btn" disabled={busy} onClick={()=>void configure(configuration())}><Settings2 size={17}/>{busy?"Guardando…":"Guardar configuración"}</button></div></section>:null}</div>;
}
