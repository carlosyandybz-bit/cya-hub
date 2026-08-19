"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Term = { id: number; label: string; term_key: string; taxonomy: string; sort_order: number };
type DeclaredStyle = {
  person_id: number;
  style_term_id: number;
  role_mode: "leader" | "follower" | "both";
  self_reported_level_term_id: number | null;
  is_primary: boolean;
  active: boolean;
};
type RuntimeField = { field_key: string; value: unknown };
type RuntimePayload = { fields?: RuntimeField[] };

type Props = {
  client: SupabaseClient;
  personId: number | null;
  questionnaireRevision?: number;
  notify?: (message: string) => void;
};

const roleLabels: Record<DeclaredStyle["role_mode"], string> = {
  leader: "Leader",
  follower: "Follower",
  both: "Role Rotation",
};

export function StudentDeclaredDanceStylesEditor({ client, personId, questionnaireRevision = 0, notify }: Props) {
  const [experience, setExperience] = useState("");
  const [styles, setStyles] = useState<Term[]>([]);
  const [levels, setLevels] = useState<Term[]>([]);
  const [rows, setRows] = useState<DeclaredStyle[]>([]);
  const [styleId, setStyleId] = useState("");
  const [roleMode, setRoleMode] = useState<DeclaredStyle["role_mode"]>("leader");
  const [levelId, setLevelId] = useState("");
  const [primary, setPrimary] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!personId) return;
    const [runtimeResult, termsResult, rowsResult] = await Promise.all([
      client.rpc("form_runtime", { p_form_key: "onboarding", p_person_id: personId, p_mode: "edit" }),
      client.from("catalog_terms").select("id,label,term_key,taxonomy,sort_order").in("taxonomy", ["dance_style", "dance_level"]).eq("active", true).order("sort_order"),
      client.from("student_declared_dance_styles").select("person_id,style_term_id,role_mode,self_reported_level_term_id,is_primary,active").eq("person_id", personId).eq("active", true),
    ]);
    if (runtimeResult.error) { setError(runtimeResult.error.message); return; }
    if (termsResult.error) { setError(termsResult.error.message); return; }
    if (rowsResult.error) { setError(rowsResult.error.message); return; }
    const runtime = runtimeResult.data as RuntimePayload | null;
    const field = runtime?.fields?.find((item) => item.field_key === "dance_experience");
    setExperience(typeof field?.value === "string" ? field.value : "");
    const terms = (termsResult.data ?? []) as Term[];
    setStyles(terms.filter((item) => item.taxonomy === "dance_style"));
    setLevels(terms.filter((item) => item.taxonomy === "dance_level"));
    setRows((rowsResult.data ?? []) as DeclaredStyle[]);
  }, [client, personId]);

  useEffect(() => { void load(); }, [load, questionnaireRevision]);

  const availableStyles = useMemo(() => styles.filter((style) => editingStyleId === style.id || !rows.some((row) => row.style_term_id === style.id)), [editingStyleId, rows, styles]);
  const styleName = (id: number) => styles.find((item) => item.id === id)?.label ?? `Estilo ${id}`;
  const levelName = (id: number | null) => id ? levels.find((item) => item.id === id)?.label ?? "Nivel indicado" : "Nivel sin indicar";

  function reset() {
    setEditingStyleId(null); setStyleId(""); setRoleMode("leader"); setLevelId(""); setPrimary(false); setError("");
  }

  function edit(row: DeclaredStyle) {
    setEditingStyleId(row.style_term_id);
    setStyleId(String(row.style_term_id));
    setRoleMode(row.role_mode);
    setLevelId(row.self_reported_level_term_id ? String(row.self_reported_level_term_id) : "");
    setPrimary(row.is_primary);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personId || !styleId) return setError("Selecciona un estilo.");
    setBusy(true); setError("");
    const result = await client.rpc("save_student_declared_dance_style", {
      p_person_id: personId,
      p_style_term_id: Number(styleId),
      p_role_mode: roleMode,
      p_self_reported_level_term_id: levelId ? Number(levelId) : null,
      p_is_primary: primary,
    });
    setBusy(false);
    if (result.error) return setError(result.error.message);
    notify?.("Datos de baile actualizados.");
    reset();
    await load();
  }

  async function remove(row: DeclaredStyle) {
    if (!personId || busy) return;
    setBusy(true); setError("");
    const result = await client.rpc("remove_student_declared_dance_style", { p_person_id: personId, p_style_term_id: row.style_term_id });
    setBusy(false);
    if (result.error) return setError(result.error.message);
    notify?.("Estilo eliminado de tus datos de baile.");
    if (editingStyleId === row.style_term_id) reset();
    await load();
  }

  if (!personId || experience !== "already_dance") return null;

  return <section aria-labelledby="declared-dance-title" style={{ marginTop: 20, display: "grid", gap: 14 }}>
    <div>
      <strong id="declared-dance-title" style={{ display: "block", fontSize: 16 }}>Tu baile</strong>
      <span style={{ display: "block", marginTop: 4, opacity: .72, fontSize: 13 }}>Añade todos los estilos que bailas. Esto es lo que tú nos indicas; tu nivel evaluado por CYA se guarda aparte.</span>
    </div>

    {rows.length ? <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => <article key={row.style_term_id} style={{ border: "1px solid color-mix(in srgb, currentColor 13%, transparent)", borderRadius: 14, padding: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "flex", gap: 6, alignItems: "center" }}>{row.is_primary ? <Star size={15} fill="currentColor" aria-label="Estilo principal" /> : null}{styleName(row.style_term_id)}</strong>
          <small style={{ display: "block", marginTop: 3, opacity: .7 }}>{roleLabels[row.role_mode]} · {levelName(row.self_reported_level_term_id)}</small>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="icon-btn" onClick={() => edit(row)} aria-label={`Editar ${styleName(row.style_term_id)}`}><Pencil size={16}/></button>
          <button type="button" className="icon-btn" onClick={() => void remove(row)} disabled={busy} aria-label={`Eliminar ${styleName(row.style_term_id)}`}><Trash2 size={16}/></button>
        </div>
      </article>)}
    </div> : <p className="modal-intro">Todavía no has añadido ningún estilo. Puedes dejarlo vacío y volver cuando quieras.</p>}

    {availableStyles.length || editingStyleId ? <form onSubmit={save} className="form">
      <div className="fields-2">
        <label className="field"><span>Estilo</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)} disabled={editingStyleId !== null}><option value="">Seleccionar</option>{availableStyles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="field"><span>¿Cómo lo bailas?</span><select value={roleMode} onChange={(event) => setRoleMode(event.target.value as DeclaredStyle["role_mode"])}><option value="leader">Leader</option><option value="follower">Follower</option><option value="both">Role Rotation · Leader y Follower</option></select></label>
        <label className="field"><span>Nivel que consideras que tienes</span><select value={levelId} onChange={(event) => setLevelId(event.target.value)}><option value="">Prefiero no indicarlo</option>{levels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="field" style={{ alignSelf: "end" }}><span>Estilo principal</span><span style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}><input type="checkbox" checked={primary} onChange={(event) => setPrimary(event.target.checked)} /> Marcar como principal</span></label>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="actions">{editingStyleId ? <button type="button" className="btn ghost" onClick={reset}>Cancelar</button> : null}<button className="btn" disabled={busy || !styleId}>{editingStyleId ? <Check size={17}/> : <Plus size={17}/>}{busy ? "Guardando…" : editingStyleId ? "Guardar cambios" : "Añadir estilo"}</button></div>
    </form> : null}
  </section>;
}
