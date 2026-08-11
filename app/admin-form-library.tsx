"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronRight, CopyPlus, FileText, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type FormDefinition = { id:number; form_key:string; admin_name:string; visible_title:string|null; description:string|null; context_key:string; form_type:string; status:string; active_version:number };
type FormVersion = { id:number; form_id:number; version_number:number; status:string; change_note:string|null };
type FormField = { id:number; form_version_id:number; field_key:string; field_type:string; label:string; help_text:string|null; required:boolean; canonical_path:string|null; sort_order:number; active:boolean };

type Props = { client: SupabaseClient; notify: (message:string)=>void };

export function AdminFormLibrary({ client, notify }: Props) {
  const [forms,setForms]=useState<FormDefinition[]>([]), [versions,setVersions]=useState<FormVersion[]>([]), [fields,setFields]=useState<FormField[]>([]);
  const [selectedId,setSelectedId]=useState<number|null>(null), [busy,setBusy]=useState(""), [loading,setLoading]=useState(true);

  const load=useCallback(async()=>{
    setLoading(true);
    const [f,v,ff]=await Promise.all([
      client.from("form_definitions").select("id,form_key,admin_name,visible_title,description,context_key,form_type,status,active_version").order("admin_name"),
      client.from("form_versions").select("id,form_id,version_number,status,change_note").order("version_number",{ascending:false}),
      client.from("form_fields").select("id,form_version_id,field_key,field_type,label,help_text,required,canonical_path,sort_order,active").order("sort_order"),
    ]);
    const error=f.error||v.error||ff.error;
    if(error) notify(error.message);
    setForms((f.data??[]) as FormDefinition[]); setVersions((v.data??[]) as FormVersion[]); setFields((ff.data??[]) as FormField[]);
    setSelectedId((current)=>current??((f.data?.[0] as FormDefinition|undefined)?.id??null)); setLoading(false);
  },[client,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  const selected=forms.find((form)=>form.id===selectedId)??null;
  const activeVersion=selected?versions.find((version)=>version.form_id===selected.id&&version.version_number===selected.active_version)??null:null;
  const draftVersion=selected?versions.find((version)=>version.form_id===selected.id&&version.status==="draft")??null:null;
  const workingVersion=draftVersion??activeVersion;
  const workingFields=useMemo(()=>workingVersion?fields.filter((field)=>field.form_version_id===workingVersion.id).sort((a,b)=>a.sort_order-b.sort_order):[],[fields,workingVersion]);

  async function createDraft(){ if(!selected)return; setBusy("draft"); const r=await client.rpc("create_form_draft_version",{p_form_id:selected.id,p_change_note:`Nueva versión de ${selected.admin_name}`}); if(r.error)notify(r.error.message); else {await load();notify("Borrador creado. La versión publicada sigue intacta.");} setBusy(""); }
  async function publish(){ if(!selected||!draftVersion)return; setBusy("publish"); const r=await client.rpc("publish_form_version",{p_form_id:selected.id,p_version_number:draftVersion.version_number}); if(r.error)notify(r.error.message); else {await load();notify(`Versión ${draftVersion.version_number} publicada.`);} setBusy(""); }
  async function toggleStatus(){ if(!selected)return; setBusy("status"); const next=selected.status==="active"?"inactive":"active"; const r=await client.rpc("set_form_definition_status",{p_form_id:selected.id,p_status:next}); if(r.error)notify(r.error.message); else {await load();notify(next==="active"?"Formulario activado.":"Formulario pausado.");} setBusy(""); }
  async function updateField(field:FormField,changes:Record<string,unknown>){ if(!draftVersion)return; setBusy(`field-${field.id}`); const r=await client.rpc("update_form_draft_field",{p_field_id:field.id,p_label:changes.label??field.label,p_help_text:changes.help_text===undefined?field.help_text:changes.help_text,p_required:changes.required??field.required,p_active:changes.active??field.active,p_sort_order:changes.sort_order??field.sort_order,p_options:null,p_visibility:null,p_condition:null,p_validation:null}); if(r.error)notify(r.error.message); else await load(); setBusy(""); }

  if(loading)return <div className="compact-empty"><FileText/><span>Cargando biblioteca de formularios…</span></div>;
  return <div className="admin-split">
    <aside className="card admin-choice-list"><header><h2>Formularios</h2><span>{forms.length}</span></header>{forms.map((form)=><button key={form.id} className={selectedId===form.id?"active":""} onClick={()=>setSelectedId(form.id)}><FileText/><span><strong>{form.admin_name}</strong><small>{form.context_key} · publicada v{form.active_version}</small></span><ChevronRight/></button>)}</aside>
    <section className="card pad admin-form-editor">{selected?<>
      <div className="card-head"><div><p className="eyebrow">{draftVersion?`Borrador v${draftVersion.version_number}`:`Publicada v${selected.active_version}`}</p><h2>{selected.visible_title||selected.admin_name}</h2></div><button type="button" className="btn ghost" disabled={busy==="status"} onClick={toggleStatus}>{selected.status==="active"?"Pausar":"Activar"}</button></div>
      {selected.description?<p className="admin-description">{selected.description}</p>:null}
      <div className="admin-read-list"><div><span>Estado</span><strong>{selected.status}</strong></div><div><span>Tipo</span><strong>{selected.form_type}</strong></div><div><span>Versión publicada</span><strong>v{selected.active_version}</strong></div></div>
      <div className="actions">{!draftVersion?<button type="button" className="btn" disabled={busy==="draft"} onClick={createDraft}><CopyPlus size={17}/>{busy==="draft"?"Creando…":"Crear nueva versión"}</button>:<button type="button" className="btn" disabled={busy==="publish"} onClick={publish}><CheckCircle2 size={17}/>{busy==="publish"?"Publicando…":`Publicar v${draftVersion.version_number}`}</button>}</div>
      <p className="modal-intro">{draftVersion?"Estás editando un borrador. Los envíos y la versión publicada no cambian hasta que pulses Publicar.":"La versión publicada es inmutable. Crea una nueva versión para cambiar campos."}</p>
      <div className="form-field-admin-list">{workingFields.map((field)=><FieldRow key={`${field.id}-${field.label}-${field.help_text??""}-${field.sort_order}-${field.required}-${field.active}`} field={field} editable={Boolean(draftVersion)} busy={busy===`field-${field.id}`} save={(changes)=>updateField(field,changes)}/>)}</div>
    </>:<div className="compact-empty"><FileText/><span>Selecciona un formulario.</span></div>}</section>
  </div>;
}

function FieldRow({field,editable,busy,save}:{field:FormField;editable:boolean;busy:boolean;save:(changes:Record<string,unknown>)=>Promise<void>}){
  const [label,setLabel]=useState(field.label), [help,setHelp]=useState(field.help_text??""), [order,setOrder]=useState(String(field.sort_order));
  if(!editable)return <div className={!field.active?"inactive":""}><span className="field-order">{field.sort_order}</span><span><strong>{field.label}</strong><small>{field.field_type}{field.canonical_path?` · reutiliza ${field.canonical_path}`:""}{field.required?" · obligatorio":""}</small></span></div>;
  return <div className={!field.active?"inactive":""}><span className="field-order">{field.sort_order}</span><span className="field"><input value={label} onChange={(event)=>setLabel(event.target.value)}/><input value={help} onChange={(event)=>setHelp(event.target.value)} placeholder="Ayuda opcional"/><small>{field.field_type}{field.canonical_path?` · ${field.canonical_path}`:" · respuesta específica"}</small></span><label><small>Obligatorio</small><input type="checkbox" checked={field.required} onChange={(event)=>void save({required:event.target.checked})}/></label><label><small>Activo</small><input type="checkbox" checked={field.active} onChange={(event)=>void save({active:event.target.checked})}/></label><span className="field"><small>Orden</small><input type="text" inputMode="numeric" pattern="[0-9]*" value={order} onChange={(event)=>setOrder(event.target.value.replace(/\D/g,""))}/></span><button type="button" className="icon-btn" disabled={busy||!label.trim()} aria-label={`Guardar ${field.label}`} onClick={()=>void save({label:label.trim(),help_text:help.trim()||null,sort_order:Number(order||0)})}><Save size={17}/></button></div>;
}
