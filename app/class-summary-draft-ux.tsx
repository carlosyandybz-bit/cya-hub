"use client";

import { useEffect, useState } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

type CyaHistoryState = {
  cyaHub?: boolean;
  view?: string;
  liveClassId?: number | null;
  [key: string]: unknown;
};

type SummaryDraft = {
  version: 1;
  classId: number;
  studentMessage: string;
  internalNote: string;
  updatedAt: string;
};

type BoundSummary = {
  root: HTMLElement;
  student: HTMLTextAreaElement;
  internal: HTMLTextAreaElement;
  classId: number;
  cleanup: () => void;
};

type PendingClass = {
  id: number;
  scheduled_start_at: string;
  class_participants: Array<{ person_id: number }>;
};

const DRAFT_PREFIX = "cya:class-summary-draft:v1:";
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STUDENT_PLACEHOLDER = "Resumen, recomendaciones o recordatorio visible";
const INTERNAL_PLACEHOLDER = "Solo profesores";

function currentClassId() {
  const state = window.history.state as CyaHistoryState | null;
  const value = Number(state?.liveClassId || 0);
  return state?.cyaHub && state.view === "live" && Number.isInteger(value) && value > 0 ? value : null;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function resolveClassIdFromSummary(root: HTMLElement) {
  const existing = currentClassId();
  if (existing) return existing;

  const client = getRuntimeSupabaseClient();
  if (!client) return null;
  const contextText = root.querySelector<HTMLElement>(".workflow-head > div > p:last-child")?.textContent?.trim() || "";
  if (!contextText) return null;

  const classResult = await client
    .from("classes")
    .select("id,scheduled_start_at,class_participants(person_id)")
    .eq("status", "finished")
    .is("pedagogy_closed_at", null)
    .order("scheduled_start_at", { ascending: false })
    .limit(50);
  if (classResult.error) return null;

  const classes = (classResult.data ?? []) as unknown as PendingClass[];
  const personIds = [...new Set(classes.flatMap((item) => item.class_participants.map((participant) => participant.person_id)))];
  const peopleResult = personIds.length
    ? await client.from("people").select("id,display_name").in("id", personIds)
    : { data: [], error: null };
  if (peopleResult.error) return null;
  const names = new Map(((peopleResult.data ?? []) as Array<{ id: number; display_name: string }>).map((person) => [person.id, person.display_name]));

  const matches = classes.filter((item) => {
    if (!contextText.includes(dateLabel(item.scheduled_start_at))) return false;
    const participantNames = item.class_participants.map((participant) => names.get(participant.person_id)).filter(Boolean) as string[];
    return participantNames.length > 0 && participantNames.every((name) => contextText.includes(name));
  });
  if (matches.length !== 1) return null;

  const classId = matches[0].id;
  const state = (window.history.state || {}) as CyaHistoryState;
  window.history.replaceState({ ...state, cyaHub: true, view: "live", liveClassId: classId }, "", window.location.href);
  return classId;
}

function keyFor(classId: number) {
  return `${DRAFT_PREFIX}${classId}`;
}

function readDraft(classId: number): SummaryDraft | null {
  try {
    const raw = window.localStorage.getItem(keyFor(classId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SummaryDraft>;
    const updatedAt = typeof parsed.updatedAt === "string" ? Date.parse(parsed.updatedAt) : Number.NaN;
    const valid = parsed.version === 1
      && parsed.classId === classId
      && typeof parsed.studentMessage === "string"
      && typeof parsed.internalNote === "string"
      && Number.isFinite(updatedAt)
      && Date.now() - updatedAt <= MAX_DRAFT_AGE_MS;
    if (!valid) {
      window.localStorage.removeItem(keyFor(classId));
      return null;
    }
    return parsed as SummaryDraft;
  } catch {
    window.localStorage.removeItem(keyFor(classId));
    return null;
  }
}

function writeDraft(classId: number, studentMessage: string, internalNote: string) {
  try {
    if (!studentMessage.trim() && !internalNote.trim()) {
      window.localStorage.removeItem(keyFor(classId));
      return;
    }
    const draft: SummaryDraft = {
      version: 1,
      classId,
      studentMessage,
      internalNote,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(keyFor(classId), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in hardened/private browser modes. The form
    // remains usable; persistence is a resilience enhancement, not a blocker.
  }
}

function setReactTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ClassSummaryDraftUx() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let bound: BoundSummary | null = null;
    let resolving = false;
    let disposed = false;

    const unbind = () => {
      if (!bound) return;
      bound.cleanup();
      bound = null;
    };

    const bindVisibleSummary = async () => {
      const root = document.querySelector<HTMLElement>(".class-workflow-page.final-summary");
      const student = root?.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${STUDENT_PLACEHOLDER}"]`) ?? null;
      const internal = root?.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${INTERNAL_PLACEHOLDER}"]`) ?? null;

      if (!root || !student || !internal) {
        unbind();
        setActive(false);
        setStatus("");
        return;
      }

      let classId = currentClassId();
      if (!classId) {
        if (resolving) return;
        resolving = true;
        classId = await resolveClassIdFromSummary(root);
        resolving = false;
        if (disposed || !root.isConnected) return;
      }
      if (!classId) {
        setActive(true);
        setStatus("Preparando guardado automático…");
        return;
      }

      if (bound && bound.root === root && bound.student === student && bound.internal === internal && bound.classId === classId) {
        return;
      }

      unbind();
      setActive(true);

      const restored = readDraft(classId);
      if (restored) {
        setReactTextareaValue(student, restored.studentMessage);
        setReactTextareaValue(internal, restored.internalNote);
        setStatus("Borrador recuperado · se guarda temporalmente en este dispositivo.");
      } else {
        setStatus("Guardado automático temporal en este dispositivo hasta cerrar la clase.");
      }

      let saveTimer = 0;
      let closeAttemptAt = 0;
      const persist = () => {
        window.clearTimeout(saveTimer);
        setStatus("Guardando borrador…");
        saveTimer = window.setTimeout(() => {
          writeDraft(classId, student.value, internal.value);
          setStatus("Borrador guardado automáticamente.");
        }, 180);
      };
      student.addEventListener("input", persist);
      internal.addEventListener("input", persist);

      const closeButton = [...root.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => /cerrar y enviar al alumno/i.test(button.textContent || ""));
      const markClosing = () => { closeAttemptAt = Date.now(); };
      closeButton?.addEventListener("click", markClosing);

      const removalObserver = new MutationObserver(() => {
        if (root.isConnected) return;
        removalObserver.disconnect();
        window.clearTimeout(saveTimer);
        student.removeEventListener("input", persist);
        internal.removeEventListener("input", persist);
        closeButton?.removeEventListener("click", markClosing);
        if (closeAttemptAt && Date.now() - closeAttemptAt < 10_000) {
          try { window.localStorage.removeItem(keyFor(classId)); } catch { /* noop */ }
        }
      });
      removalObserver.observe(document.body, { childList: true, subtree: true });

      bound = {
        root,
        student,
        internal,
        classId,
        cleanup: () => {
          removalObserver.disconnect();
          window.clearTimeout(saveTimer);
          student.removeEventListener("input", persist);
          internal.removeEventListener("input", persist);
          closeButton?.removeEventListener("click", markClosing);
        },
      };
    };

    void bindVisibleSummary();
    const observer = new MutationObserver(() => { void bindVisibleSummary(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
      unbind();
    };
  }, []);

  if (!active || !status) return null;
  return <p className="summary-draft-status summary-draft-status-fixed" role="status" aria-live="polite">{status}</p>;
}
