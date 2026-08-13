"use client";

import { MapPin, Save } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

type LocationTerm = {
  id: number;
  label: string;
  term_key: string;
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

export function P31DefaultsAdmin({ client, notify }: Props) {
  const [locations, setLocations] = useState<LocationTerm[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [locationResult, defaultResult] = await Promise.all([
      client.from("catalog_terms")
        .select("id,label,term_key")
        .eq("taxonomy", "location")
        .eq("active", true)
        .order("sort_order")
        .order("label"),
      client.from("app_operational_defaults")
        .select("default_location_term_id")
        .eq("singleton", true)
        .maybeSingle(),
    ]);
    if (locationResult.error) notify(locationResult.error.message);
    else setLocations((locationResult.data ?? []) as LocationTerm[]);
    if (defaultResult.error) notify(defaultResult.error.message);
    else setSelected(defaultResult.data?.default_location_term_id ? String(defaultResult.data.default_location_term_id) : "");
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    setBusy(true);
    const { data } = await client.auth.getSession();
    const result = await client.from("app_operational_defaults").update({
      default_location_term_id: selected ? Number(selected) : null,
      updated_by: data.session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    if (result.error) notify(result.error.message);
    else notify(selected ? "Ubicación predeterminada guardada." : "Las clases nuevas no tendrán ubicación predeterminada.");
    setBusy(false);
  }

  if (loading) return <div className="admin-loading"><span className="spinner" /><p>Preparando defaults…</p></div>;

  return <article className="card pad">
    <div className="card-head">
      <div><p className="eyebrow">Defaults operativos</p><h2>Ubicación predeterminada</h2></div>
      <MapPin />
    </div>
    <p>Se aplica al programar una clase solo cuando el flujo no indica una ubicación concreta. Un override explícito siempre tiene prioridad.</p>
    <div className="fields-3">
      <label className="field">
        <span>Ubicación para nuevas clases</span>
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Sin ubicación predeterminada</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
        </select>
      </label>
      <button className="btn" type="button" disabled={busy} onClick={() => void save()}><Save /> {busy ? "Guardando…" : "Guardar default"}</button>
    </div>
    {!locations.length ? <small>Primero crea una ubicación en Catálogos y categorías.</small> : null}
  </article>;
}
