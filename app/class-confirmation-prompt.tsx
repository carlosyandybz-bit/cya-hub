"use client";

import { CalendarDays, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

type ScheduledClass = {
  id: number;
  status: string;
  scheduled_start_at: string;
  duration_minutes: number;
  style?: string | null;
  confirmation_status?: "pending" | "confirmed" | string;
  confirmed_at?: string | null;
};

type StudentPortalSnapshot = {
  classes?: ScheduledClass[];
};

const DISMISSED_KEY = "cya:class-confirmation:dismissed";

function formatClassDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isStudentExperience() {
  try {
    return window.localStorage.getItem("cya:experience") === "student";
  } catch {
    return false;
  }
}

export function ClassConfirmationPrompt() {
  const [pending, setPending] = useState<ScheduledClass[]>([]);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const current = pending[0] ?? null;

  const load = useCallback(async () => {
    if (!isStudentExperience()) {
      setPending([]);
      setVisible(false);
      return false;
    }

    const client = getRuntimeSupabaseClient();
    if (!client) return false;

    const session = await client.auth.getSession();
    if (!session.data.session) {
      setPending([]);
      setVisible(false);
      return true;
    }

    const result = await client.rpc("student_portal_snapshot");
    if (result.error || !result.data) return true;

    const now = Date.now();
    const classes = ((result.data as StudentPortalSnapshot).classes ?? [])
      .filter((item) => item.status === "scheduled")
      .filter((item) => new Date(item.scheduled_start_at).getTime() > now)
      .filter((item) => item.confirmation_status !== "confirmed")
      .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());

    setPending(classes);
    if (!classes.length) {
      setVisible(false);
      return true;
    }

    let dismissed = "";
    try { dismissed = window.sessionStorage.getItem(DISMISSED_KEY) || ""; } catch { /* noop */ }
    setVisible(dismissed !== String(classes[0].id));
    return true;
  }, []);

  useEffect(() => {
    let attempts = 0;
    const tryLoad = () => {
      attempts += 1;
      void load().then((resolved) => {
        if (resolved || attempts >= 40) window.clearInterval(timer);
      });
    };
    const timer = window.setInterval(tryLoad, 250);
    tryLoad();

    const refresh = () => void load();
    window.addEventListener("cya:auth-change", refresh);
    window.addEventListener("cya:experience-change", refresh);
    window.addEventListener("cya:refresh", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("cya:auth-change", refresh);
      window.removeEventListener("cya:experience-change", refresh);
      window.removeEventListener("cya:refresh", refresh);
    };
  }, [load]);

  const remainingLabel = useMemo(() => {
    if (pending.length <= 1) return "";
    return ` · ${pending.length} clases pendientes de confirmar`;
  }, [pending.length]);

  async function confirmCurrent() {
    if (!current || saving) return;
    const client = getRuntimeSupabaseClient();
    if (!client) {
      setError("CYA todavía está terminando de cargar tu sesión. Inténtalo de nuevo.");
      return;
    }

    setSaving(true);
    setError("");
    const result = await client.rpc("confirm_scheduled_class", { p_class_id: current.id });
    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    try { window.sessionStorage.removeItem(DISMISSED_KEY); } catch { /* noop */ }
    const remaining = pending.filter((item) => item.id !== current.id);
    setPending(remaining);
    setVisible(Boolean(remaining.length));
    setSaving(false);
    window.dispatchEvent(new CustomEvent("cya:refresh"));
  }

  function dismiss() {
    if (!current) return;
    try { window.sessionStorage.setItem(DISMISSED_KEY, String(current.id)); } catch { /* noop */ }
    setVisible(false);
  }

  if (!visible || !current) return null;

  return <div className="cya-class-confirmation-layer" role="presentation">
    <section className="cya-class-confirmation" role="dialog" aria-modal="false" aria-labelledby="cya-class-confirmation-title">
      <button className="cya-class-confirmation-close" type="button" onClick={dismiss} aria-label="Confirmar más tarde"><X /></button>
      <div className="cya-class-confirmation-icon"><CalendarDays /></div>
      <div className="cya-class-confirmation-copy">
        <span>CLASE PROGRAMADA{remainingLabel}</span>
        <h2 id="cya-class-confirmation-title">Confirma que vienes a clase</h2>
        <p><strong>{current.style || "Clase con Carlos & Andy"}</strong><br />{formatClassDate(current.scheduled_start_at)} · {current.duration_minutes} min</p>
        <small>Si todavía no lo sabes, puedes cerrarlo y confirmarlo más tarde. El día anterior avisaremos al profesor si sigue pendiente.</small>
        {error ? <div className="cya-class-confirmation-error" role="alert">{error}</div> : null}
      </div>
      <button className="cya-class-confirmation-action" type="button" disabled={saving} onClick={() => void confirmCurrent()}>
        <Check /> {saving ? "Confirmando…" : "Confirmar clase"}
      </button>
    </section>
  </div>;
}
