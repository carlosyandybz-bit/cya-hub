"use client";

import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  Gauge,
  GraduationCap,
  Link2,
  Palette,
  Save,
  Settings,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IdentityContext } from "./v14-types";
import { AdminDataTransfer } from "./admin-data-transfer";

type AdminSection = "general" | "team" | "forms" | "teaching" | "missions" | "notifications" | "data" | "integrations" | "appearance" | "security";

type Term = { id: number; label: string; term_key: string; taxonomy: string; active?: boolean; sort_order: number };
type MemberRole = { user_id: string; role: string; active: boolean; created_at: string };
type UserProfile = { id: string; display_name: string };
type FormDefinition = { id: number; form_key: string; admin_name: string; visible_title: string | null; description: string | null; context_key: string; form_type: string; status: string; active_version: number };
type FormVersion = { id: number; form_id: number; version_number: number; status: string; change_note: string | null };
type FormField = { id: number; form_version_id: number; field_key: string; field_type: string; label: string; help_text: string | null; required: boolean; canonical_path: string | null; sort_order: number; active: boolean };
type MissionEngine = { singleton: boolean; enabled: boolean; max_daily: number; workdays: number[]; nightly_time: string; daily_review_time: string; delivery_interval_minutes: number; quiet_hours_start: string; quiet_hours_end: string; allow_urgent_during_quiet: boolean };
type MissionRule = { rule_key: string; module_key: string; name: string; description: string | null; enabled: boolean; mission_type: string; frequency: string; valid_days: number[]; schedule_time: string | null; priority: string; estimated_duration_minutes: number; lead_minutes: number; max_daily: number; duplicate_strategy: string; failure_behavior: string; evidence_requirement: string; auto_complete: boolean; calendar_block: boolean };
type NotificationRule = { event_key: string; label: string; enabled: boolean; channels: string[]; anticipation_minutes: number; quiet_hours_start: string; quiet_hours_end: string; template: string };
type Integration = { integration_key: string; label: string; status: string; last_checked_at: string | null; last_error: string | null };
type TransferJob = { id: number; direction: string; domain: string; file_name: string | null; format: string; status: string; preview: Record<string, unknown>; result: Record<string, unknown>; error_message: string | null; created_at: string };
type AuditEvent = { id: number; event_type: string; summary: string; created_at: string };

type AdminData = {
  members: MemberRole[];
  profiles: UserProfile[];
  forms: FormDefinition[];
  versions: FormVersion[];
  fields: FormField[];
  engine: MissionEngine | null;
  missionRules: MissionRule[];
  notificationRules: NotificationRule[];
  integrations: Integration[];
  transfers: TransferJob[];
  audits: AuditEvent[];
};

const emptyData: AdminData = { members: [], profiles: [], forms: [], versions: [], fields: [], engine: null, missionRules: [], notificationRules: [], integrations: [], transfers: [], audits: [] };

const sections: Array<[AdminSection, string, typeof Settings]> = [
  ["general", "General", Gauge],
  ["team", "Equipo y roles", UsersRound],
  ["forms", "Formularios", FileText],
  ["teaching", "Enseñanza", GraduationCap],
  ["missions", "Misiones", Target],
  ["notifications", "Notificaciones", Bell],
  ["data", "Datos", Database],
  ["integrations", "Integraciones", Link2],
  ["appearance", "Apariencia", Palette],
  ["security", "Seguridad", ShieldCheck],
];

const roleLabels: Record<string, string> = { admin: "Administrador", teacher_admin: "Profesor administrador", teacher: "Profesor", student: "Alumno" };
const taxonomyLabels: Record<string, string> = {
  dance_style: "Estilos",
  dance_role: "Roles de baile",
  dance_level: "Niveles",
  aptitude: "Aptitudes",
  evaluation_scale: "Escala de evaluación",
  correction_category: "Categorías de corrección",
  explanation_category: "Categorías de explicación",
  exercise_category: "Categorías de ejercicio",
  sequence_category: "Categorías de secuencia",
};

function readableError(message: string) {
  if (message.includes("permission") || message.includes("permiso")) return "Tu cuenta no tiene permiso real para realizar ese cambio.";
  return message;
}

function boundedInteger(value: string, min: number, max: number) {
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

export function AdminView({ client, identity, terms, notify, leave }: { client: SupabaseClient; identity: IdentityContext; terms: Term[]; notify: (message: string) => void; leave: () => void }) {
  const [section, setSection] = useState<AdminSection>("general");
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all([
      client.from("app_member_roles").select("user_id,role,active,created_at").order("created_at"),
      client.from("user_profiles").select("id,display_name").order("display_name"),
      client.from("form_definitions").select("id,form_key,admin_name,visible_title,description,context_key,form_type,status,active_version").order("admin_name"),
      client.from("form_versions").select("id,form_id,version_number,status,change_note").order("version_number", { ascending: false }),
      client.from("form_fields").select("id,form_version_id,field_key,field_type,label,help_text,required,canonical_path,sort_order,active").order("sort_order"),
      client.from("mission_engine_settings").select("singleton,enabled,max_daily,workdays,nightly_time,daily_review_time,delivery_interval_minutes,quiet_hours_start,quiet_hours_end,allow_urgent_during_quiet").eq("singleton", true).maybeSingle(),
      client.from("mission_rules").select("rule_key,module_key,name,description,enabled,mission_type,frequency,valid_days,schedule_time,priority,estimated_duration_minutes,lead_minutes,max_daily,duplicate_strategy,failure_behavior,evidence_requirement,auto_complete,calendar_block").order("module_key").order("name"),
      client.from("notification_rules").select("event_key,label,enabled,channels,anticipation_minutes,quiet_hours_start,quiet_hours_end,template").order("label"),
      client.from("integration_settings").select("integration_key,label,status,last_checked_at,last_error").order("label"),
      client.from("data_transfer_jobs").select("id,direction,domain,file_name,format,status,preview,result,error_message,created_at").order("created_at", { ascending: false }).limit(20),
      client.from("audit_events").select("id,event_type,summary,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) notify(readableError(firstError.message));
    setData({
      members: (results[0].data ?? []) as MemberRole[], profiles: (results[1].data ?? []) as UserProfile[],
      forms: (results[2].data ?? []) as FormDefinition[], versions: (results[3].data ?? []) as FormVersion[], fields: (results[4].data ?? []) as FormField[],
      engine: (results[5].data ?? null) as MissionEngine | null, missionRules: (results[6].data ?? []) as MissionRule[], notificationRules: (results[7].data ?? []) as NotificationRule[],
      integrations: (results[8].data ?? []) as Integration[], transfers: (results[9].data ?? []) as TransferJob[], audits: (results[10].data ?? []) as AuditEvent[],
    });
    setSelectedFormId((current) => current ?? ((results[2].data?.[0] as FormDefinition | undefined)?.id ?? null));
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function updateRow(table: string, key: string, value: string | number | boolean, changes: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    const result = await client.from(table).update(changes).eq(key, value);
    if (result.error) notify(readableError(result.error.message));
    else { await load(); notify("Cambio guardado."); }
    setBusy("");
  }

  async function updateMemberRole(userId: string, role: string, active: boolean) {
    if (userId === identity.user_id && role === "admin" && !active) {
      notify("Tu propio acceso administrativo no se puede desactivar desde esta pantalla.");
      return;
    }
    setBusy(`role-${userId}-${role}`);
    const exists = data.members.some((member) => member.user_id === userId && member.role === role);
    const result = exists
      ? await client.from("app_member_roles").update({ active }).eq("user_id", userId).eq("role", role)
      : await client.from("app_member_roles").insert({ user_id: userId, role, active });
    if (result.error) notify(readableError(result.error.message));
    else { await load(); notify("Rol actualizado."); }
    setBusy("");
  }

  const selectedForm = data.forms.find((form) => form.id === selectedFormId) ?? null;
  const selectedVersion = selectedForm ? data.versions.find((version) => version.form_id === selectedForm.id && version.version_number === selectedForm.active_version) ?? null : null;
  const selectedFields = selectedVersion ? data.fields.filter((field) => field.form_version_id === selectedVersion.id).sort((a, b) => a.sort_order - b.sort_order) : [];
  const termGroups = useMemo(() => Object.entries(terms.reduce<Record<string, Term[]>>((groups, term) => ({ ...groups, [term.taxonomy]: [...(groups[term.taxonomy] ?? []), term] }), {})), [terms]);

  function generalSection() {
    return <div className="admin-content-grid">
      <article className="card pad admin-system"><div className="card-head"><h2>Estado de CYA Hub</h2><span className="badge portal">Operativo</span></div><div className="admin-metric-grid"><div><strong>{data.members.filter((member) => member.active).length}</strong><span>roles activos</span></div><div><strong>{data.forms.filter((form) => form.status === "active").length}</strong><span>formularios</span></div><div><strong>{data.missionRules.filter((rule) => rule.enabled).length}</strong><span>reglas de misión</span></div><div><strong>{data.notificationRules.filter((rule) => rule.enabled).length}</strong><span>avisos activos</span></div></div></article>
      <article className="card pad"><div className="card-head"><h2>Configuración general</h2><Settings /></div><div className="admin-read-list"><div><span>Zona horaria</span><strong>{identity.timezone}</strong></div><div><span>Perfil principal</span><strong>{identity.profile_name}</strong></div><div><span>Experiencias disponibles</span><strong>{[identity.can_teach && "Profesor", identity.can_study && "Alumno", identity.can_admin && "Administrador"].filter(Boolean).join(" · ")}</strong></div></div></article>
    </div>;
  }

  function teamSection() {
    const grouped = new Map<string, MemberRole[]>();
    data.members.forEach((member) => grouped.set(member.user_id, [...(grouped.get(member.user_id) ?? []), member]));
    const userIds = [...new Set([...data.profiles.map((profile) => profile.id), ...data.members.map((member) => member.user_id)])];
    return <section className="admin-stack"><header className="admin-section-head"><div><h2>Equipo y roles</h2><p>Una persona puede enseñar, aprender y administrar sin duplicar su identidad.</p></div></header>{userIds.map((userId) => { const roles = grouped.get(userId) ?? []; const options = [...new Set(["admin", "teacher", "student", ...roles.map((role) => role.role)])]; return <article className="card admin-team-row" key={userId}><span className="admin-avatar"><UsersRound /></span><div><strong>{data.profiles.find((profile) => profile.id === userId)?.display_name ?? "Miembro del equipo"}</strong><small>{userId === identity.user_id ? "Tu identidad" : "Miembro"}</small></div><div className="role-chip-list">{options.map((role) => { const memberRole = roles.find((item) => item.role === role); return <label key={role} className={memberRole?.active ? "active" : ""}><span>{roleLabels[role] ?? role}</span><Switch checked={Boolean(memberRole?.active)} label={`Activar ${role}`} onChange={(checked) => updateMemberRole(userId, role, checked)} /></label>; })}</div></article>; })}</section>;
  }

  function formsSection() {
    return <div className="admin-split"><aside className="card admin-choice-list"><header><h2>Formularios</h2><span>{data.forms.length}</span></header>{data.forms.map((form) => <button key={form.id} className={selectedFormId === form.id ? "active" : ""} onClick={() => setSelectedFormId(form.id)}><FileText /><span><strong>{form.admin_name}</strong><small>{form.context_key} · v{form.active_version}</small></span><ChevronRight /></button>)}</aside><section className="card pad admin-form-editor">{selectedForm ? <><div className="card-head"><div><p className="eyebrow">Versión {selectedForm.active_version}</p><h2>{selectedForm.visible_title || selectedForm.admin_name}</h2></div><Switch checked={selectedForm.status === "active"} label="Activar formulario" onChange={(checked) => updateRow("form_definitions", "id", selectedForm.id, { status: checked ? "active" : "inactive" }, `form-${selectedForm.id}`)} /></div>{selectedForm.description ? <p className="admin-description">{selectedForm.description}</p> : null}<div className="form-field-admin-list">{selectedFields.map((field) => <div key={field.id} className={!field.active ? "inactive" : ""}><span className="field-order">{field.sort_order}</span><span><strong>{field.label}</strong><small>{field.field_type}{field.canonical_path ? ` · reutiliza ${field.canonical_path}` : ""}</small></span><label><small>Obligatorio</small><Switch checked={field.required} label={`Obligatorio: ${field.label}`} onChange={(checked) => updateRow("form_fields", "id", field.id, { required: checked }, `field-required-${field.id}`)} /></label><label><small>Activo</small><Switch checked={field.active} label={`Activo: ${field.label}`} onChange={(checked) => updateRow("form_fields", "id", field.id, { active: checked }, `field-active-${field.id}`)} /></label></div>)}</div></> : <div className="compact-empty"><FileText /><span>Selecciona un formulario.</span></div>}</section></div>;
  }

  function teachingSection() {
    return <section className="admin-stack"><header className="admin-section-head"><div><h2>Configuración pedagógica</h2><p>Estilos, roles, niveles, aptitudes y categorías compartidos por toda la aplicación.</p></div></header><div className="admin-taxonomy-grid">{termGroups.map(([taxonomy, values]) => <article className="card pad" key={taxonomy}><div className="card-head"><h2>{taxonomyLabels[taxonomy] ?? taxonomy}</h2><span>{values.length}</span></div><div className="term-list">{values.sort((a, b) => a.sort_order - b.sort_order).map((term) => <div key={term.id}><span>{term.label}</span><small>{term.term_key}</small></div>)}</div></article>)}</div></section>;
  }

  function missionsSection() {
    return <section className="admin-stack"><article className="card pad mission-engine-settings"><div className="card-head"><div><p className="eyebrow">Motor</p><h2>Misiones automáticas</h2></div>{data.engine ? <Switch checked={data.engine.enabled} label="Activar motor de misiones" onChange={(checked) => updateRow("mission_engine_settings", "singleton", true, { enabled: checked }, "mission-engine")} /> : null}</div>{data.engine ? <div className="fields-3"><label className="field"><span>Máximo diario</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={data.engine.max_daily} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 50); if (value === null) { event.currentTarget.value = String(data.engine?.max_daily ?? 1); notify("Indica un número entre 1 y 50."); return; } void updateRow("mission_engine_settings", "singleton", true, { max_daily: value }, "engine-max"); }} /></label><label className="field"><span>Revisión diaria</span><input type="time" defaultValue={String(data.engine.daily_review_time).slice(0, 5)} onBlur={(event) => updateRow("mission_engine_settings", "singleton", true, { daily_review_time: event.target.value }, "engine-review")} /></label><label className="field"><span>Horas silenciosas</span><span className="quiet-hours">{String(data.engine.quiet_hours_start).slice(0, 5)}–{String(data.engine.quiet_hours_end).slice(0, 5)}</span></label></div> : null}</article><div className="admin-rule-list">{data.missionRules.map((rule) => <details className="card admin-rule" key={rule.rule_key}><summary><Target /><span><strong>{rule.name}</strong><small>{rule.module_key} · {rule.frequency}</small></span><span className={`badge ${rule.priority === "urgent" ? "mission-urgent" : ""}`}>{rule.priority === "priority" ? "Prioritaria" : rule.priority === "urgent" ? "Urgente" : "Normal"}</span><Switch checked={rule.enabled} label={`Activar ${rule.name}`} onChange={(checked) => updateRow("mission_rules", "rule_key", rule.rule_key, { enabled: checked }, `mission-${rule.rule_key}`)} /><ChevronRight /></summary><div className="admin-rule-body"><p>{rule.description}</p><div className="fields-3"><label className="field"><span>Prioridad</span><select defaultValue={rule.priority} onChange={(event) => updateRow("mission_rules", "rule_key", rule.rule_key, { priority: event.target.value }, `mission-priority-${rule.rule_key}`)}><option value="normal">Normal</option><option value="priority">Prioritaria</option><option value="urgent">Urgente</option></select></label><label className="field"><span>Duración estimada</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.estimated_duration_minutes} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 480); if (value === null) { event.currentTarget.value = String(rule.estimated_duration_minutes); notify("Indica una duración entre 1 y 480 minutos."); return; } void updateRow("mission_rules", "rule_key", rule.rule_key, { estimated_duration_minutes: value }, `mission-duration-${rule.rule_key}`); }} /></label><label className="field"><span>Máximo diario</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.max_daily} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 1, 20); if (value === null) { event.currentTarget.value = String(rule.max_daily); notify("Indica un número entre 1 y 20."); return; } void updateRow("mission_rules", "rule_key", rule.rule_key, { max_daily: value }, `mission-max-${rule.rule_key}`); }} /></label></div><div className="rule-toggles"><label><Switch checked={rule.auto_complete} label="Completar automáticamente" onChange={(checked) => updateRow("mission_rules", "rule_key", rule.rule_key, { auto_complete: checked }, `mission-auto-${rule.rule_key}`)} /><span>Auto-completar</span></label><label><Switch checked={rule.calendar_block} label="Permitir bloqueo de agenda" onChange={(checked) => updateRow("mission_rules", "rule_key", rule.rule_key, { calendar_block: checked }, `mission-calendar-${rule.rule_key}`)} /><span>Bloque de agenda</span></label></div></div></details>)}</div></section>;
  }

  function notificationsSection() {
    return <section className="admin-stack"><header className="admin-section-head"><div><h2>Avisos y comunicaciones</h2><p>El aviso interno y los envíos externos se configuran por separado.</p></div></header><div className="notification-rule-list">{data.notificationRules.map((rule) => <article className="card notification-rule" key={rule.event_key}><div><Bell /><span><strong>{rule.label}</strong><small>{rule.channels.map((channel) => channel === "internal" ? "Aviso interno" : channel === "email" ? "Email" : channel === "whatsapp" ? "WhatsApp" : channel).join(" · ")}</small></span></div><label className="field"><span>Anticipación</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.anticipation_minutes} onBlur={(event) => { const value = boundedInteger(event.currentTarget.value, 0, 10080); if (value === null) { event.currentTarget.value = String(rule.anticipation_minutes); notify("Indica una anticipación entre 0 y 10080 minutos."); return; } void updateRow("notification_rules", "event_key", rule.event_key, { anticipation_minutes: value }, `notification-time-${rule.event_key}`); }} /></label><Switch checked={rule.enabled} label={`Activar ${rule.label}`} onChange={(checked) => updateRow("notification_rules", "event_key", rule.event_key, { enabled: checked }, `notification-${rule.event_key}`)} /></article>)}</div></section>;
  }

  function dataSection() {
    return <AdminDataTransfer client={client} transfers={data.transfers} refresh={load} notify={notify} />;
  }

  function integrationsSection() {
    return <section className="admin-stack"><header className="admin-section-head"><div><h2>Integraciones</h2><p>Estado de los servicios externos, sin mostrar credenciales.</p></div></header><div className="integration-grid">{data.integrations.map((integration) => <article className="card pad" key={integration.integration_key}><div className="card-head"><Link2 /><span className={`badge ${integration.status === "connected" ? "portal" : ""}`}>{integration.status === "connected" ? "Conectada" : integration.status === "available" ? "Disponible" : integration.status}</span></div><h3>{integration.label}</h3><p>{integration.last_error || (integration.last_checked_at ? `Última comprobación ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(integration.last_checked_at))}` : "Lista para configurar cuando se necesite.")}</p></article>)}</div></section>;
  }

  function appearanceSection() {
    return <section className="admin-content-grid"><article className="card pad appearance-preview"><div className="brand-preview">CYA</div><div><p className="eyebrow">Identidad activa</p><h2>CYA Hub</h2><p>Morado CYA, iconos limpios, contraste legible y márgenes seguros para iPhone.</p></div></article><article className="card pad"><div className="card-head"><h2>Reglas visuales</h2><Palette /></div><div className="status-list"><div><CheckCircle2 /> Sin amarillo fluorescente</div><div><CheckCircle2 /> Iconos sin cuadrados decorativos</div><div><CheckCircle2 /> Barra inferior fuera del contenido</div><div><CheckCircle2 /> Tipografía unificada</div></div></article></section>;
  }

  function securitySection() {
    return <section className="admin-stack"><article className="card pad security-summary"><ShieldCheck /><div><p className="eyebrow">Protección activa</p><h2>Permisos reales en servidor</h2><p>“Ver como” cambia la experiencia visual, pero cada operación vuelve a comprobar el permiso auténtico de la cuenta.</p></div></article><article className="card pad"><div className="card-head"><h2>Actividad reciente</h2><span>{data.audits.length}</span></div>{data.audits.length ? <div className="audit-list">{data.audits.map((event) => <div key={event.id}><span>{event.event_type}</span><strong>{event.summary}</strong><small>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.created_at))}</small></div>)}</div> : <div className="compact-empty"><ShieldCheck /><span>No hay operaciones sensibles recientes.</span></div>}</article></section>;
  }

  const content = section === "general" ? generalSection() : section === "team" ? teamSection() : section === "forms" ? formsSection() : section === "teaching" ? teachingSection() : section === "missions" ? missionsSection() : section === "notifications" ? notificationsSection() : section === "data" ? dataSection() : section === "integrations" ? integrationsSection() : section === "appearance" ? appearanceSection() : securitySection();

  return <><header className="page-head admin-page-head"><div><p className="eyebrow">Inicio · Administración</p><h1>Administración</h1><p>Configuración organizada por finalidad, con autoridad real en CYA Hub.</p></div><button className="btn ghost" onClick={leave}>Volver a Inicio</button></header><div className="admin-layout"><nav className="admin-nav" aria-label="Secciones de Administración">{sections.map(([value, label, Icon]) => <button key={value} className={section === value ? "active" : ""} onClick={() => setSection(value)}><Icon /><span>{label}</span><ChevronRight /></button>)}</nav><main className="admin-panel">{loading ? <div className="admin-loading"><span className="spinner" /><p>Preparando Administración…</p></div> : content}</main></div>{busy ? <div className="saving-indicator"><Save /> Guardando</div> : null}</>;
}
