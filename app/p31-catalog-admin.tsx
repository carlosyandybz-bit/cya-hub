"use client";

import { MapPin, Plus, Save, Tag } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type CatalogTerm = {
  id: number;
  taxonomy: string;
  term_key: string;
  label: string;
  sort_order: number;
  active: boolean;
};

type TagUsage = { tag: string; count: number };

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

const taxonomies = [
  ["dance_style", "Estilos"],
  ["dance_role", "Roles de baile"],
  ["dance_level", "Niveles"],
  ["aptitude", "Aptitudes"],
  ["evaluation_scale", "Escala de evaluación"],
  ["correction_category", "Categorías de corrección"],
  ["explanation_category", "Categorías de explicación"],
  ["exercise_category", "Categorías de ejercicio"],
  ["sequence_category", "Categorías de secuencia"],
  ["location", "Ubicaciones"],
] as const;

const taxonomyLabels = new Map<string, string>(taxonomies);

function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

export function P31CatalogAdmin({ client, notify }: Props) {
  const [terms, setTerms] = useState<CatalogTerm[]>([]);
  const [tags, setTags] = useState<TagUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [newTaxonomy, setNewTaxonomy] = useState<string>("location");
  const [newLabel, setNewLabel] = useState("");
  const [tagRename, setTagRename] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [termResult, tagResult] = await Promise.all([
      client.from("catalog_terms")
        .select("id,taxonomy,term_key,label,sort_order,active")
        .in("taxonomy", taxonomies.map(([key]) => key))
        .order("taxonomy")
        .order("sort_order")
        .order("label"),
      client.from("teaching_content_tags").select("tag"),
    ]);
    if (termResult.error) notify(termResult.error.message);
    else setTerms((termResult.data ?? []) as CatalogTerm[]);
    if (tagResult.error) notify(tagResult.error.message);
    else {
      const counts = new Map<string, number>();
      for (const row of (tagResult.data ?? []) as Array<{ tag: string }>) counts.set(row.tag, (counts.get(row.tag) ?? 0) + 1);
      setTags([...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, "es")));
    }
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const grouped = useMemo(() => taxonomies.map(([key, label]) => ({
    key,
    label,
    values: terms.filter((term) => term.taxonomy === key),
  })), [terms]);

  async function createTerm(event: FormEvent) {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return notify("Escribe un nombre para el nuevo elemento.");
    const base = slug(label);
    if (!base) return notify("El nombre no permite generar una clave estable.");
    let termKey = base;
    let suffix = 2;
    const existing = new Set(terms.filter((term) => term.taxonomy === newTaxonomy).map((term) => term.term_key));
    while (existing.has(termKey)) termKey = `${base}_${suffix++}`;
    const current = terms.filter((term) => term.taxonomy === newTaxonomy);
    const nextSort = current.length ? Math.max(...current.map((term) => term.sort_order)) + 10 : 10;
    setBusy("create");
    const result = await client.from("catalog_terms").insert({
      taxonomy: newTaxonomy,
      term_key: termKey,
      label,
      sort_order: nextSort,
      active: true,
      metadata: {},
    });
    if (result.error) notify(result.error.message);
    else {
      setNewLabel("");
      await load();
      notify("Elemento de catálogo creado.");
    }
    setBusy("");
  }

  async function updateTerm(id: number, changes: Partial<Pick<CatalogTerm, "label" | "sort_order" | "active">>, key: string) {
    setBusy(key);
    const result = await client.from("catalog_terms").update(changes).eq("id", id);
    if (result.error) notify(result.error.message);
    else {
      await load();
      notify("Catálogo actualizado.");
    }
    setBusy("");
  }

  async function renameTag(oldTag: string) {
    const next = (tagRename[oldTag] ?? "").trim();
    if (!next || next === oldTag) return notify("Escribe un nombre de etiqueta diferente.");
    if (next.length > 60) return notify("La etiqueta no puede superar 60 caracteres.");
    setBusy(`tag-${oldTag}`);
    const result = await client.rpc("admin_rename_teaching_tag", { p_old_tag: oldTag, p_new_tag: next });
    if (result.error) notify(result.error.message);
    else {
      setTagRename((current) => ({ ...current, [oldTag]: "" }));
      await load();
      notify(`Etiqueta renombrada en ${Number(result.data ?? 0)} relación${Number(result.data ?? 0) === 1 ? "" : "es"}.`);
    }
    setBusy("");
  }

  if (loading) return <div className="admin-loading"><span className="spinner" /><p>Preparando catálogos…</p></div>;

  return <section className="admin-stack">
    <header className="admin-section-head">
      <div><h2>Catálogos y categorías</h2><p>Una única fuente de verdad para estilos, roles, niveles, parámetros, categorías y ubicaciones.</p></div>
    </header>

    <form className="card pad" onSubmit={createTerm}>
      <div className="card-head"><h2>Nuevo elemento</h2><Plus /></div>
      <div className="fields-3">
        <label className="field"><span>Catálogo</span><select value={newTaxonomy} onChange={(event) => setNewTaxonomy(event.target.value)}>{taxonomies.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>Nombre</span><input value={newLabel} maxLength={120} onChange={(event) => setNewLabel(event.target.value)} placeholder={newTaxonomy === "location" ? "Ej. Estudio Málaga" : "Nombre visible"} /></label>
        <button className="btn" type="submit" disabled={busy === "create"}><Plus /> Añadir</button>
      </div>
      <p className="muted">La clave interna se crea una sola vez y no cambia al renombrar el elemento.</p>
    </form>

    <div className="admin-taxonomy-grid">
      {grouped.map((group) => <article className="card pad" key={group.key}>
        <div className="card-head"><h2>{group.label}</h2><span>{group.values.length}</span></div>
        {group.values.length ? <div className="term-list">
          {group.values.map((term) => <div key={term.id} style={{ opacity: term.active ? 1 : .58 }}>
            <span style={{ minWidth: 0 }}>
              <input aria-label={`Nombre de ${term.label}`} defaultValue={term.label} maxLength={120} onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (!value) { event.currentTarget.value = term.label; notify("El nombre no puede quedar vacío."); return; }
                if (value !== term.label) void updateTerm(term.id, { label: value }, `term-label-${term.id}`);
              }} />
              <small>{term.term_key}</small>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input aria-label={`Orden de ${term.label}`} type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={term.sort_order} style={{ width: 58 }} onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (!Number.isInteger(value) || value < 0 || value > 100000) { event.currentTarget.value = String(term.sort_order); notify("El orden debe ser un entero entre 0 y 100000."); return; }
                if (value !== term.sort_order) void updateTerm(term.id, { sort_order: value }, `term-order-${term.id}`);
              }} />
              <Switch checked={term.active} label={`${term.active ? "Desactivar" : "Activar"} ${term.label}`} onChange={(active) => void updateTerm(term.id, { active }, `term-active-${term.id}`)} />
            </span>
          </div>)}
        </div> : <div className="compact-empty">{group.key === "location" ? <MapPin /> : <Save />}<span>{group.key === "location" ? "Aún no hay ubicaciones guardadas." : "Sin elementos."}</span></div>}
      </article>)}
    </div>

    <article className="card pad">
      <div className="card-head"><div><p className="eyebrow">Enseñanza</p><h2>Etiquetas utilizadas</h2></div><Tag /></div>
      <p>Las etiquetas nacen dentro del contenido. Aquí puedes renombrarlas globalmente; si el nuevo nombre ya existe, CYA fusiona las relaciones sin duplicarlas.</p>
      {tags.length ? <div className="admin-read-list">
        {tags.map((item) => <div key={item.tag}>
          <span><strong>{item.tag}</strong><small>{item.count} contenido{item.count === 1 ? "" : "s"}</small></span>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input aria-label={`Nuevo nombre para ${item.tag}`} value={tagRename[item.tag] ?? ""} maxLength={60} placeholder="Nuevo nombre" onChange={(event) => setTagRename((current) => ({ ...current, [item.tag]: event.target.value }))} />
            <button className="btn ghost" type="button" disabled={busy === `tag-${item.tag}`} onClick={() => void renameTag(item.tag)}>Renombrar</button>
          </span>
        </div>)}
      </div> : <div className="compact-empty"><Tag /><span>Todavía no hay etiquetas en contenidos.</span></div>}
    </article>
  </section>;
}
