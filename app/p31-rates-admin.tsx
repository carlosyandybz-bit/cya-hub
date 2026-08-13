"use client";

import { Plus, WalletCards } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Rate = {
  id: number;
  name: string;
  rate_type: "individual" | "pair" | "event" | "other";
  duration_minutes: number | null;
  price_cents: number;
  currency: string;
  description: string | null;
  active: boolean;
  sort_order: number;
};

type Props = { client: SupabaseClient; notify: (message: string) => void };

function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function moneyToCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1000000 ? Math.round(amount * 100) : null;
}

function optionalMinutes(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const minutes = Number(raw);
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 100000 ? minutes : undefined;
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

export function P31RatesAdmin({ client, notify }: Props) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const result = await client.from("marketing_rates")
      .select("id,name,rate_type,duration_minutes,price_cents,currency,description,active,sort_order")
      .order("sort_order")
      .order("name");
    if (result.error) notify(result.error.message);
    else setRates((result.data ?? []) as Rate[]);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveRate(rate: Rate | null, form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const rateType = String(data.get("rate_type") ?? "individual") as Rate["rate_type"];
    const duration = optionalMinutes(String(data.get("duration") ?? ""));
    const priceCents = moneyToCents(String(data.get("price") ?? ""));
    const description = String(data.get("description") ?? "").trim();
    if (!name) return notify("El nombre de la tarifa es obligatorio.");
    if (duration === undefined) return notify("La duración debe quedar vacía o contener minutos válidos.");
    if (priceCents === null) return notify("Indica un importe válido.");
    const key = rate ? `rate-${rate.id}` : "rate-new";
    setBusy(key);
    const result = await client.rpc("save_marketing_rate", {
      p_rate_id: rate?.id ?? null,
      p_name: name,
      p_rate_type: rateType,
      p_duration_minutes: duration,
      p_price_cents: priceCents,
      p_description: description || null,
      p_active: rate?.active ?? true,
    });
    if (result.error) notify(result.error.message);
    else {
      setCreating(false);
      await load();
      notify(rate ? "Tarifa actualizada." : "Tarifa creada.");
    }
    setBusy("");
  }

  async function setActive(rate: Rate, active: boolean) {
    setBusy(`active-${rate.id}`);
    const result = await client.rpc("save_marketing_rate", {
      p_rate_id: rate.id,
      p_name: rate.name,
      p_rate_type: rate.rate_type,
      p_duration_minutes: rate.duration_minutes,
      p_price_cents: rate.price_cents,
      p_description: rate.description,
      p_active: active,
    });
    if (result.error) notify(result.error.message);
    else { await load(); notify(active ? "Tarifa activada." : "Tarifa desactivada."); }
    setBusy("");
  }

  async function setOrder(rate: Rate, value: string) {
    const order = Number(value);
    if (!Number.isInteger(order) || order < 0 || order > 100000) return notify("El orden debe ser un entero entre 0 y 100000.");
    if (order === rate.sort_order) return;
    setBusy(`order-${rate.id}`);
    const result = await client.from("marketing_rates").update({ sort_order: order }).eq("id", rate.id);
    if (result.error) notify(result.error.message);
    else { await load(); notify("Orden de tarifa actualizado."); }
    setBusy("");
  }

  return <section className="admin-stack">
    <header className="admin-section-head">
      <div><h2>Tarifas</h2><p>Las mismas tarifas que utiliza Marketing, sin duplicar precios ni duración en otra tabla.</p></div>
      <button className="btn" type="button" onClick={() => setCreating((value) => !value)}><Plus /> Nueva tarifa</button>
    </header>

    {creating ? <article className="card pad">
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void saveRate(null, event.currentTarget); }}>
        <div className="fields-3">
          <label className="field"><span>Nombre</span><input name="name" maxLength={120} required /></label>
          <label className="field"><span>Tipo</span><select name="rate_type" defaultValue="individual"><option value="individual">Individual</option><option value="pair">Pareja</option><option value="event">Evento</option><option value="other">Otra</option></select></label>
          <label className="field"><span>Duración opcional · min</span><input name="duration" type="text" inputMode="numeric" pattern="[0-9]*" /></label>
          <label className="field"><span>Importe · €</span><input name="price" type="text" inputMode="decimal" placeholder="0,00" required /></label>
          <label className="field"><span>Descripción</span><input name="description" maxLength={300} /></label>
          <button className="btn" type="submit" disabled={busy === "rate-new"}><Plus /> Guardar tarifa</button>
        </div>
      </form>
    </article> : null}

    {rates.length ? <div className="admin-rule-list">
      {rates.map((rate) => <details className="card admin-rule" key={rate.id}>
        <summary>
          <WalletCards />
          <span><strong>{rate.name}</strong><small>{rate.duration_minutes ? `${rate.duration_minutes} min · ` : ""}{euros(rate.price_cents)} · {rate.rate_type}</small></span>
          <span className={`badge ${rate.active ? "portal" : ""}`}>{rate.active ? "Activa" : "Inactiva"}</span>
        </summary>
        <div className="admin-rule-body">
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void saveRate(rate, event.currentTarget); }}>
            <div className="fields-3">
              <label className="field"><span>Nombre</span><input name="name" defaultValue={rate.name} maxLength={120} required /></label>
              <label className="field"><span>Tipo</span><select name="rate_type" defaultValue={rate.rate_type}><option value="individual">Individual</option><option value="pair">Pareja</option><option value="event">Evento</option><option value="other">Otra</option></select></label>
              <label className="field"><span>Duración opcional · min</span><input name="duration" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rate.duration_minutes ?? ""} /></label>
              <label className="field"><span>Importe · €</span><input name="price" type="text" inputMode="decimal" defaultValue={(rate.price_cents / 100).toFixed(2).replace(".", ",")} required /></label>
              <label className="field"><span>Descripción</span><input name="description" defaultValue={rate.description ?? ""} maxLength={300} /></label>
              <label className="field"><span>Orden</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rate.sort_order} onBlur={(event) => void setOrder(rate, event.currentTarget.value)} /></label>
            </div>
            <div className="actions">
              <button className="btn" type="submit" disabled={busy === `rate-${rate.id}`}>Guardar cambios</button>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Switch checked={rate.active} label={`${rate.active ? "Desactivar" : "Activar"} ${rate.name}`} onChange={(active) => void setActive(rate, active)} /><span>{rate.active ? "Disponible" : "Oculta"}</span></label>
            </div>
          </form>
        </div>
      </details>)}
    </div> : <div className="compact-empty"><WalletCards /><span>No hay tarifas guardadas. Crea la primera sin salir de Administración.</span></div>}
  </section>;
}
