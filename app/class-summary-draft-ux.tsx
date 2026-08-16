"use client";

import { useEffect, useState } from "react";

type CyaHistoryState = {
  cyaHub?: boolean;
  view?: string;
  liveClassId?: number | null;
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

const DRAFT_PREFIX = "cya:class-summary-draft:v1:";
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STUDENT_PLACEHOLDER = "Resumen, recomendaciones o recordatorio visible";
const INTERNAL_PLACEHOLDER = "Solo profesores";

function currentClassId() {
  const state = window.history.state as CyaHistoryState | null;
  const value = Number(state?.liveClassId || 0);
  return state?.cyaHub && state.view === "live" && Number.isInteger(value) && value > 0 ? value : null;
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

    const unbind = () => {
      if (!bound) return;
      bound.cleanup();
      bound = null;
    };

    const bindVisibleSummary = () => {
      const root = document.querySelector<HTMLElement>(".class-workflow-page.final-summary");
      const classId = currentClassId();
      const student = root?.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${STUDENT_PLACEHOLDER}"]`) ?? null;
      const internal = root?.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${INTERNAL_PLACEHOLDER}"]`) ?? null;

      if (!root || !classId || !student || !internal) {
        unbind();
        setActive(false);
        setStatus("");
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

    bindVisibleSummary();
    const observer = new MutationObserver(bindVisibleSummary);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      unbind();
    };
  }, []);

  if (!active || !status) return null;
  return <p className="summary-draft-status summary-draft-status-fixed" role="status" aria-live="polite">{status}</p>;
}
