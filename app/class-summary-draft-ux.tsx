"use client";

import { useEffect } from "react";

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
    // Storage may be unavailable in hardened/private browser modes. The form
    // remains fully usable; persistence is a resilience enhancement, not a blocker.
  }
}

function setReactTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function ensureStatus(root: HTMLElement) {
  const messagesCard = root.querySelector<HTMLElement>(`.workflow-card:has(textarea[placeholder="${STUDENT_PLACEHOLDER}"])`);
  if (!messagesCard) return null;
  let status = messagesCard.querySelector<HTMLElement>(".summary-draft-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "summary-draft-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const heading = messagesCard.querySelector(".card-head");
    heading?.insertAdjacentElement("afterend", status);
  }
  return status;
}

function bindSummary(root: HTMLElement) {
  if (root.dataset.ux05DraftBound === "true") return;
  const classId = currentClassId();
  if (!classId) return;

  const student = root.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${STUDENT_PLACEHOLDER}"]`);
  const internal = root.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${INTERNAL_PLACEHOLDER}"]`);
  if (!student || !internal) return;

  root.dataset.ux05DraftBound = "true";
  root.dataset.ux05ClassId = String(classId);
  const status = ensureStatus(root);
  const restored = readDraft(classId);
  if (restored) {
    setReactTextareaValue(student, restored.studentMessage);
    setReactTextareaValue(internal, restored.internalNote);
    if (status) status.textContent = "Borrador recuperado · se guarda temporalmente en este dispositivo.";
  } else if (status) {
    status.textContent = "Guardado automático temporal en este dispositivo hasta cerrar la clase.";
  }

  let saveTimer = 0;
  let closing = false;
  const persist = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      writeDraft(classId, student.value, internal.value);
      if (status) status.textContent = "Borrador guardado automáticamente.";
    }, 180);
  };
  student.addEventListener("input", persist);
  internal.addEventListener("input", persist);

  const closeButton = [...root.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => /cerrar y enviar al alumno/i.test(button.textContent || ""));
  const markClosing = () => { closing = true; };
  closeButton?.addEventListener("click", markClosing);

  const removalObserver = new MutationObserver(() => {
    if (root.isConnected) return;
    removalObserver.disconnect();
    window.clearTimeout(saveTimer);
    student.removeEventListener("input", persist);
    internal.removeEventListener("input", persist);
    closeButton?.removeEventListener("click", markClosing);
    if (closing) {
      try { window.localStorage.removeItem(keyFor(classId)); } catch { /* noop */ }
    }
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });
}

export function ClassSummaryDraftUx() {
  useEffect(() => {
    const bindVisibleSummary = () => {
      const root = document.querySelector<HTMLElement>(".class-workflow-page.final-summary");
      if (root) bindSummary(root);
    };
    bindVisibleSummary();
    const observer = new MutationObserver(bindVisibleSummary);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
