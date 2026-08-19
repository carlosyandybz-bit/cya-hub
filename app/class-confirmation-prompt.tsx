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
  confirmation_opens_at?: string | null;
};

type StudentPortalSnapshot = {
  classes?: ScheduledClass[];
};

const DISMISSED_KEY = "cya:class-confirmation:dismissed";
const PREPARE_AFTER_CONFIRM_KEY = "cya:class-confirmation:prepare-next";

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

function openPreparationWhenReady() {
  let attempts = 0;
  let homeRequested = false;
  const timer = window.setInterval(() => {
    attempts += 1;
    const target = document.getElementById("prepare-next-class-title");
    if (target) {
      window.clearInterval(timer);
      try { window.sessionStorage.removeItem(PREPARE_AFTER_CONFIRM_KEY); } catch { /* noop */ }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!homeRequested) {
      const homeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Portal CYA"] button'))
        .find((button) => button.textContent?.trim().includes("Inicio"));
      if (homeButton) {
        homeRequested = true;
        homeButton.click();
      }
    }

    if (attempts >= 40) window.clearInterval(timer);
  }, 100);
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
      .filter((item) => Boolean(item.confirmation_opens_at) && new Date(item.confirmation_opens_at as string).getTime() <= now)
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
        if (resolved || attempts >= 40) window.clearInterval(startupTimer);
      });
    };
    const startupTimer = window.setInterval(tryLoad, 250);
    const eligibilityTimer = window.setInterval(() => void load(), 60_000);
    tryLoad();

    const refresh = () => void load();
    window.addEventListener("cya:auth-change", refresh);
    window.addEventListener("cya:experience-change", refresh);
    window.addEventListener("cya:refresh", refresh);
    return () => {
      window.clearInterval(startupTimer);
      window.clearInterval(eligibilityTimer);
      window.removeEventListener("cya:auth-change", refresh);
      window.removeEventListener("cya:experience-change", refresh);
      window.removeEventListener("cya:refresh", refresh);
    };
  }, [load]);

  useEffect(() => {
    let shouldPrepare = false;
    try { shouldPrepare = Boolean(window.sessionStorage.getItem(PREPARE_AFTER_CONFIRM_KEY)); } catch { /* noop */ }
    if (shouldPrepare) openPreparationWhenReady();
  }, []);

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

    const remaining = pending.filter((item) => item.id !== current.id);
    try {
      window.sessionStorage.setItem(PREPARE_AFTER_CONFIRM_KEY, String(current.id));
      if (remaining.length) window.sessionStorage.setItem(DISMISSED_KEY, String(remaining[0].id));
      else window.sessionStorage.removeItem(DISMISSED_KEY);
    } catch { /* noop */ }

    setPending(remaining);
    setVisible(false);
    setSaving(false);
    window.dispatchEvent(new CustomEvent("cya:class-confirmed", { detail: { classId: current.id } }));
    window.dispatchEvent(new CustomEvent("cya:refresh"));
    openPreparationWhenReady();
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
        <small>La confirmación se abre a las 08:00 del día anterior. Si todavía no lo sabes, puedes cerrarla y volver más tarde. Al confirmar te llevaremos directamente a preparar la clase.</small>
        {error ? <div className="cya-class-confirmation-error" role="alert">{error}</div> : null}
      </div>
      <button className="cya-class-confirmation-action" type="button" disabled={saving} onClick={() => void confirmCurrent()}>
        <Check /> {saving ? "Confirmando…" : "Confirmar clase"}
      </button>
    </section>
  </div>;
}