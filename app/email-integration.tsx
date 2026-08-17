"use client";

import { Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";

type EmailStatus = {
  configured: boolean;
  verified: boolean;
  fromAddress?: string | null;
  fromName?: string | null;
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  error?: string;
  missing?: string[];
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

export function EmailIntegration({ client, notify }: Props) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [testAddress, setTestAddress] = useState("");

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Tu sesión ha caducado. Vuelve a entrar en CYA Hub.");
    return fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  }, [client]);

  const check = useCallback(async (announce = false) => {
    setChecking(true);
    try {
      const response = await authFetch("/api/email/status");
      const payload = await response.json().catch(() => null) as EmailStatus | null;
      if (!payload) throw new Error("CYA no pudo leer el estado del correo.");
      setStatus(payload);
      if (announce) notify(payload.verified ? "Correo verificado correctamente." : payload.error || "El correo aún no está verificado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comprobar el correo.";
      setStatus({ configured: false, verified: false, error: message });
      if (announce) notify(message);
    } finally {
      setChecking(false);
    }
  }, [authFetch, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(false), 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const to = testAddress.trim();
    if (!to) return notify("Escribe una dirección donde recibir la prueba.");
    setSending(true);
    try {
      const response = await authFetch("/api/email/test", {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "No se pudo enviar el correo de prueba.");
      notify(`Correo de prueba enviado a ${to}.`);
      await check(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo enviar el correo de prueba.");
    } finally {
      setSending(false);
    }
  }

  const verified = Boolean(status?.verified);
  const configured = Boolean(status?.configured);

  return <article className="card pad">
    <div className="card-head">
      <Mail />
      <span className={`badge ${verified ? "portal" : ""}`}>
        {checking ? "Comprobando" : verified ? "Verificado" : configured ? "Configurado" : "No configurado"}
      </span>
    </div>
    <h3>Email</h3>
    <p>{verified
      ? `CYA puede enviar por SMTP seguro como ${status?.fromName || "Carlos & Andy"} <${status?.fromAddress || "hola@carlosyandy.com"}>.`
      : status?.error || "Configura el correo del dominio en las variables privadas del servidor para activar el envío desde CYA."}</p>

    <div className="status-list">
      <div><ShieldCheck /><span>La contraseña SMTP permanece únicamente en el servidor y nunca se expone al navegador.</span></div>
      {status?.host && status?.port ? <div><Mail /><span>{status.host}:{status.port} · {status.secure ? "SSL/TLS" : "sin cifrado"}</span></div> : null}
    </div>

    <div className="actions">
      <button className="btn ghost" type="button" disabled={checking || sending} onClick={() => void check(true)}>
        <RefreshCw /> {checking ? "Comprobando…" : "Comprobar conexión"}
      </button>
    </div>

    {verified ? <form className="admin-read-list" onSubmit={sendTest}>
      <label className="field">
        <span>Enviar prueba a</span>
        <input
          type="email"
          value={testAddress}
          onChange={(event) => setTestAddress(event.target.value)}
          placeholder="tu-correo@ejemplo.com"
          autoComplete="email"
          required
        />
      </label>
      <button className="btn" type="submit" disabled={sending || checking}>
        <Send /> {sending ? "Enviando…" : "Enviar correo de prueba"}
      </button>
    </form> : null}
  </article>;
}
