"use client";

import { Cloud, Mail, Megaphone, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleCalendarSync } from "./google-calendar-sync";

type IntegrationRow = {
  integration_key: string;
  label: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
};

type DriveStatus = {
  configured: boolean;
  verified: boolean;
  folderMode: "explicit" | "managed";
  folderName: string;
  error: string | null;
};

type Props = {
  client: SupabaseClient;
  integrations: IntegrationRow[];
  notify: (message: string) => void;
};

function humanDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function P31IntegrationsAdmin({ client, integrations, notify }: Props) {
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [checkingDrive, setCheckingDrive] = useState(false);
  const byKey = useMemo(() => new Map(integrations.map((item) => [item.integration_key, item])), [integrations]);

  const checkDrive = useCallback(async (announce = false) => {
    setCheckingDrive(true);
    try {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Tu sesión ha caducado.");
      const response = await fetch("/api/google-drive/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (DriveStatus & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "No se pudo comprobar Google Drive.");
      setDrive(payload);
      if (announce) notify(payload.verified ? "Google Drive verificado correctamente." : payload.error || "Google Drive no ha podido verificarse.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comprobar Google Drive.";
      setDrive({ configured: false, verified: false, folderMode: "managed", folderName: "CYA Hub - Enseñanza", error: message });
      if (announce) notify(message);
    } finally {
      setCheckingDrive(false);
    }
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkDrive(false), 0);
    return () => window.clearTimeout(timer);
  }, [checkDrive]);

  const email = byKey.get("email");
  const whatsapp = byKey.get("whatsapp");
  const meta = byKey.get("meta");

  return <section className="admin-stack">
    <header className="admin-section-head">
      <div>
        <h2>Integraciones</h2>
        <p>Una integración solo aparece como conectada o verificada cuando CYA puede demostrarlo contra el servicio real.</p>
      </div>
    </header>

    <div className="integration-grid">
      <GoogleCalendarSync client={client} notify={notify} />

      <article className="card pad">
        <div className="card-head">
          <Cloud />
          <span className={`badge ${drive?.verified ? "portal" : ""}`}>
            {checkingDrive ? "Comprobando" : drive?.verified ? "Verificada" : drive?.configured ? "No verificada" : "No configurada"}
          </span>
        </div>
        <h3>Google Drive</h3>
        <p>{drive?.verified
          ? `Acceso real confirmado. Carpeta de enseñanza: ${drive.folderName}.`
          : drive?.error || (drive?.configured ? "Hay configuración de servidor, pero Google todavía no ha confirmado el acceso." : "El servidor todavía no dispone de una configuración completa de Drive.")}</p>
        <div className="status-list">
          <div><ShieldCheck /><span>Los binarios permanecen en Drive; CYA conserva referencias y organización.</span></div>
        </div>
        <div className="actions">
          <button className="btn ghost" type="button" disabled={checkingDrive} onClick={() => void checkDrive(true)}>
            <RefreshCw /> {checkingDrive ? "Comprobando…" : "Comprobar ahora"}
          </button>
        </div>
      </article>

      <article className="card pad">
        <div className="card-head"><MessageCircle /><span className="badge">Sin API verificada</span></div>
        <h3>{whatsapp?.label || "WhatsApp"}</h3>
        <p>CYA puede preparar el mensaje y abrir WhatsApp para el envío manual. No se presenta como envío automático mientras no exista dispatcher/API verificado.</p>
        {whatsapp?.last_error ? <small>{whatsapp.last_error}</small> : null}
      </article>

      <article className="card pad">
        <div className="card-head"><Mail /><span className="badge">Sin API verificada</span></div>
        <h3>{email?.label || "Email"}</h3>
        <p>CYA puede preparar el correo y abrir el cliente del usuario. No se marca como conectado mientras no exista un proveedor de envío comprobado.</p>
        {email?.last_checked_at ? <small>Último registro: {humanDate(email.last_checked_at)}</small> : null}
      </article>

      <article className="card pad">
        <div className="card-head"><Megaphone /><span className="badge">No integrada</span></div>
        <h3>{meta?.label || "Meta"}</h3>
        <p>Instagram y Facebook siguen disponibles como canales de planificación de Marketing. Una conexión API de Meta solo se mostrará aquí cuando exista y pueda verificarse.</p>
      </article>
    </div>
  </section>;
}
