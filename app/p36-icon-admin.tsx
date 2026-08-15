"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ImageUp, RotateCcw, Search } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CYA_ICON_CATALOG } from "./cya-icon-catalog";
import styles from "./p36-icon-admin.module.css";

type Props = { client: SupabaseClient; notify: (message: string) => void };
type OverrideRow = { icon_key: string; storage_path: string; updated_at: string };

const MAX_ICON_BYTES = 512 * 1024;
const ALLOWED_ICON_TYPES = new Set(["image/png", "image/webp"]);

function publicUrl(client: SupabaseClient, path: string) {
  return client.storage.from("cya-icons").getPublicUrl(path).data.publicUrl;
}

export function P36IconAdmin({ client, notify }: Props) {
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [busy, setBusy] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const result = await client.from("app_icon_settings").select("icon_key,storage_path,updated_at").order("icon_key");
    if (result.error) notify(result.error.message);
    else setRows((result.data ?? []) as OverrideRow[]);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const byKey = useMemo(() => new Map(rows.map((row) => [row.icon_key, row])), [rows]);
  const categories = useMemo(() => ["Todos", ...new Set(CYA_ICON_CATALOG.map((item) => item.category))], []);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return CYA_ICON_CATALOG.filter((item) => (category === "Todos" || item.category === category)
      && (!normalized || `${item.label} ${item.key} ${item.usage}`.toLocaleLowerCase("es").includes(normalized)));
  }, [category, query]);

  async function upload(iconKey: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_ICON_TYPES.has(file.type)) return notify("El icono debe ser PNG o WebP.");
    if (file.size > MAX_ICON_BYTES) return notify("El icono debe pesar como máximo 512 KB.");

    const extension = file.type === "image/webp" ? "webp" : "png";
    const safeKey = iconKey.replace(/[^a-z0-9._-]/g, "-");
    const nextPath = `p36/${safeKey}/${crypto.randomUUID()}.${extension}`;
    const previous = byKey.get(iconKey)?.storage_path ?? null;
    setBusy(iconKey);

    const uploadResult = await client.storage.from("cya-icons").upload(nextPath, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (uploadResult.error) {
      setBusy("");
      return notify(uploadResult.error.message);
    }

    const session = await client.auth.getSession();
    const save = await client.from("app_icon_settings").upsert({
      icon_key: iconKey,
      storage_path: nextPath,
      updated_by: session.data.session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "icon_key" });

    if (save.error) {
      await client.storage.from("cya-icons").remove([nextPath]);
      setBusy("");
      return notify(save.error.message);
    }

    if (previous) await client.storage.from("cya-icons").remove([previous]);
    await load();
    window.dispatchEvent(new Event("cya:icons-changed"));
    notify("Icono actualizado en toda CYA Hub.");
    setBusy("");
  }

  async function reset(iconKey: string) {
    const previous = byKey.get(iconKey)?.storage_path;
    if (!previous) return;
    setBusy(iconKey);
    const removeRow = await client.from("app_icon_settings").delete().eq("icon_key", iconKey);
    if (removeRow.error) {
      setBusy("");
      return notify(removeRow.error.message);
    }
    await client.storage.from("cya-icons").remove([previous]);
    await load();
    window.dispatchEvent(new Event("cya:icons-changed"));
    notify("Icono predeterminado restaurado.");
    setBusy("");
  }

  return <section className={styles.panel} aria-labelledby="p36-icons-title">
    <header className="admin-section-head"><div><h2 id="p36-icons-title">Iconos de CYA Hub</h2><p>Cambia individualmente la iconografía del producto. Si restauras un icono, CYA vuelve automáticamente a su versión vectorial predeterminada.</p></div></header>
    <div className={styles.toolbar}>
      <label className={`search ${styles.search}`}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar icono, pantalla o uso" aria-label="Buscar iconos" /></label>
      <div className={styles.filters} aria-label="Categorías de iconos">{categories.map((value) => <button type="button" key={value} className={`${styles.filter} ${category === value ? styles.filterActive : ""}`} onClick={() => setCategory(value)}>{value}</button>)}</div>
    </div>
    {visible.length ? <div className={styles.grid}>{visible.map((item) => {
      const override = byKey.get(item.key);
      return <article className={styles.item} key={item.key}>
        <div className={styles.preview}>{override ? <img src={publicUrl(client, override.storage_path)} alt="" /> : <span className={styles.defaultMark}>CYA</span>}</div>
        <div className={styles.meta}>
          <strong>{item.label}</strong><small>{item.usage}</small><small className={styles.key}>{item.key}</small>
          <div className={styles.actions}>
            <input ref={(node) => { fileInputs.current[item.key] = node; }} className={styles.hiddenInput} type="file" accept="image/png,image/webp" onChange={(event) => void upload(item.key, event)} />
            <button type="button" className={`${styles.action} ${styles.actionPrimary}`} disabled={busy === item.key} onClick={() => fileInputs.current[item.key]?.click()}><ImageUp size={16} /> {override ? "Cambiar" : "Subir"}</button>
            {override ? <button type="button" className={styles.action} disabled={busy === item.key} onClick={() => void reset(item.key)}><RotateCcw size={16} /> Restaurar</button> : null}
          </div>
        </div>
      </article>;
    })}</div> : <div className={styles.empty}>No hay iconos que coincidan con esta búsqueda.</div>}
  </section>;
}
