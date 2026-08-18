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

function isActiveControl(button: HTMLButtonElement) {
  return button.getAttribute("aria-current") === "page"
    || button.getAttribute("aria-selected") === "true"
    || button.classList.contains("active")
    || [...button.classList].some((className) => /(?:^|__)active(?:__|$)/i.test(className) || /active/i.test(className));
}

function studentTheme(): ModuleTheme | null {
  const portal = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
  if (!portal || getComputedStyle(portal).display === "none") return null;
  const buttons = [...portal.querySelectorAll<HTMLButtonElement>("button")];
  const active = buttons.find(isActiveControl);
  const label = normalizedLabel(active || null) || "inicio";
  return STUDENT_LABEL_THEME[label] ?? "student-home";
}

function staffThemeFromDom(): ModuleTheme | null {
  const navigations = [
    document.querySelector<HTMLElement>('nav[aria-label="Módulos principales"]'),
    document.querySelector<HTMLElement>('.mobile-nav'),
  ].filter((node): node is HTMLElement => Boolean(node) && getComputedStyle(node).display !== "none");

  for (const navigation of navigations) {
    const active = [...navigation.querySelectorAll<HTMLButtonElement>("button")].find(isActiveControl);
    if (!active || active.closest('nav[aria-label="Portal CYA"]')) continue;
    const label = normalizedLabel(active);
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

  const renderedTheme = staffThemeFromDom();
  if (renderedTheme) return renderedTheme;
  if (state?.view && STAFF_VIEW_THEME[state.view]) return STAFF_VIEW_THEME[state.view];
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
