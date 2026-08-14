"use client";

import { Palette, Save } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { applyAppearanceSettings, type AppearanceSettings } from "./p31-appearance-runtime";

type Props = { client: SupabaseClient; notify: (message: string) => void };

const fallback: AppearanceSettings = {
  app_name: "CYA Hub",
  short_mark: "CYA",
  logo_url: null,
  primary_color: "#6d4aff",
  secondary_color: "#5637e8",
  typography: "geist",
  header_style: "standard",
};

export function P31AppearanceAdmin({ client, notify }: Props) {
  const [settings, setSettings] = useState<AppearanceSettings>(fallback);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await client.from("app_appearance_settings")
      .select("app_name,short_mark,logo_url,primary_color,secondary_color,typography,header_style")
      .eq("singleton", true)
      .maybeSingle();
    if (result.error) notify(result.error.message);
    else if (result.data) setSettings(result.data as AppearanceSettings);
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next: AppearanceSettings = {
      ...settings,
      app_name: settings.app_name.trim(),
      short_mark: settings.short_mark.trim(),
      logo_url: settings.logo_url?.trim() || null,
    };
    if (!next.app_name || next.app_name.length > 80) return notify("El nombre debe tener entre 1 y 80 caracteres.");
    if (!next.short_mark || next.short_mark.length > 12) return notify("La marca corta debe tener entre 1 y 12 caracteres.");
    if (next.logo_url && !next.logo_url.startsWith("/") && !/^https:\/\//i.test(next.logo_url)) return notify("El logo debe usar una ruta interna o una URL HTTPS.");

    setBusy(true);
    const { data } = await client.auth.getSession();
    const result = await client.from("app_appearance_settings").update({
      ...next,
      updated_by: data.session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    if (result.error) notify(result.error.message);
    else {
      setSettings(next);
      applyAppearanceSettings(next);
      notify("Apariencia guardada y aplicada.");
    }
    setBusy(false);
  }

  if (loading) return <div className="admin-loading"><span className="spinner" /><p>Preparando apariencia…</p></div>;

  return <section className="admin-stack">
    <header className="admin-section-head"><div><h2>Apariencia e identidad</h2><p>Configura la identidad visual común de CYA Hub de forma segura y consistente.</p></div></header>
    <form className="card pad" onSubmit={save}>
      <div className="card-head"><div><p className="eyebrow">Identidad activa</p><h2>{settings.app_name}</h2></div><Palette /></div>
      <div className="fields-3">
        <label className="field"><span>Nombre</span><input value={settings.app_name} maxLength={80} onChange={(event) => setSettings((current) => ({ ...current, app_name: event.target.value }))} /></label>
        <label className="field"><span>Marca corta</span><input value={settings.short_mark} maxLength={12} onChange={(event) => setSettings((current) => ({ ...current, short_mark: event.target.value }))} /></label>
        <label className="field"><span>Logo · ruta o HTTPS</span><input value={settings.logo_url ?? ""} placeholder="/logo.svg" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((current) => ({ ...current, logo_url: event.target.value || null }))} /></label>
        <label className="field"><span>Color principal</span><input type="color" value={settings.primary_color} onChange={(event) => setSettings((current) => ({ ...current, primary_color: event.target.value }))} /></label>
        <label className="field"><span>Color secundario</span><input type="color" value={settings.secondary_color} onChange={(event) => setSettings((current) => ({ ...current, secondary_color: event.target.value }))} /></label>
        <label className="field"><span>Tipografía</span><select value={settings.typography} onChange={(event) => setSettings((current) => ({ ...current, typography: event.target.value as AppearanceSettings["typography"] }))}><option value="geist">Geist · actual</option><option value="system">Sistema</option><option value="rounded">Redondeada</option></select></label>
        <label className="field"><span>Cabecera</span><select value={settings.header_style} onChange={(event) => setSettings((current) => ({ ...current, header_style: event.target.value as AppearanceSettings["header_style"] }))}><option value="standard">Normal</option><option value="compact">Compacta</option></select></label>
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}><Save /> {busy ? "Guardando…" : "Guardar apariencia"}</button>
        <button className="btn ghost" type="button" onClick={() => { applyAppearanceSettings(settings); notify("Previsualización aplicada sin guardar."); }}>Previsualizar</button>
      </div>
    </form>
  </section>;
}
