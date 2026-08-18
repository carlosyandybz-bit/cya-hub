"use client";

import { useEffect } from "react";

type ModuleTheme =
  | "home"
  | "students"
  | "live"
  | "teaching"
  | "marketing"
  | "admin"
  | "account"
  | "student-home"
  | "student-progress"
  | "student-formation"
  | "student-discover"
  | "student-missions";

const STAFF_VIEW_THEME: Record<string, ModuleTheme> = {
  home: "home",
  students: "students",
  credits: "students",
  classes: "live",
  agenda: "live",
  live: "live",
  teaching: "teaching",
  academy: "teaching",
  marketing: "marketing",
  statistics: "admin",
  admin: "admin",
  profile: "account",
  preferences: "account",
  notifications: "home",
};

const STAFF_LABEL_THEME: Record<string, ModuleTheme> = {
  inicio: "home",
  alumnado: "students",
  "dar clase": "live",
  enseñanza: "teaching",
  marketing: "marketing",
  estadísticas: "admin",
  "academia online": "teaching",
};

const STUDENT_LABEL_THEME: Record<string, ModuleTheme> = {
  inicio: "student-home",
  progreso: "student-progress",
  "mi formación": "student-formation",
  descubre: "student-discover",
  misiones: "student-missions",
};

const VALID_THEMES = new Set<ModuleTheme>([
  "home", "students", "live", "teaching", "marketing", "admin", "account",
  "student-home", "student-progress", "student-formation", "student-discover", "student-missions",
]);

function normalizedLabel(node: Element | null) {
  return (node?.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

function studentTheme(): ModuleTheme | null {
  const portal = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
  if (!portal || getComputedStyle(portal).display === "none") return null;
  const buttons = [...portal.querySelectorAll<HTMLButtonElement>("button")];
  const active = buttons.find((button) =>
    button.getAttribute("aria-current") === "page"
    || button.getAttribute("aria-selected") === "true"
    || button.classList.contains("active")
  );
  const label = normalizedLabel(active || null) || "inicio";
  return STUDENT_LABEL_THEME[label] ?? "student-home";
}

function staffThemeFromDom(): ModuleTheme | null {
  const activeCandidates = [
    ...document.querySelectorAll<HTMLElement>('nav[aria-label="Módulos principales"] button.active'),
    ...document.querySelectorAll<HTMLElement>('.mobile-nav button.active'),
    ...document.querySelectorAll<HTMLElement>('.mobile-nav [aria-current="page"]'),
    ...document.querySelectorAll<HTMLElement>('.mobile-nav [aria-selected="true"]'),
  ];

  for (const candidate of activeCandidates) {
    if (candidate.closest('nav[aria-label="Portal CYA"]')) continue;
    const label = normalizedLabel(candidate);
    if (STAFF_LABEL_THEME[label]) return STAFF_LABEL_THEME[label];
  }
  return null;
}

function currentTheme(): ModuleTheme | null {
  const value = document.body.dataset.cyaModule as ModuleTheme | undefined;
  return value && VALID_THEMES.has(value) ? value : null;
}

function resolveTheme(): ModuleTheme {
  const portalTheme = studentTheme();
  if (portalTheme) return portalTheme;

  const state = window.history.state as { view?: string; experience?: string } | null;
  if (state?.experience === "admin") return "admin";

  // The rendered active module is the source of truth. During router.refresh(),
  // history.state can be reconstructed temporarily as "home" while the current
  // module remains mounted. Reading the active navigation first prevents color drift.
  const renderedTheme = staffThemeFromDom();
  if (renderedTheme) return renderedTheme;

  if (state?.view && STAFF_VIEW_THEME[state.view]) return STAFF_VIEW_THEME[state.view];

  // Never flash back to Home while React/Next is rebuilding the same screen.
  return currentTheme() ?? "home";
}

export function CyaModuleTheme() {
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const next = resolveTheme();
      if (document.body.dataset.cyaModule !== next) document.body.dataset.cyaModule = next;
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("popstate", schedule);
    window.addEventListener("cya:experience-change", schedule);
    window.addEventListener("cya:refresh-complete", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current", "aria-selected", "aria-expanded"],
    });

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("cya:experience-change", schedule);
      window.removeEventListener("cya:refresh-complete", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
