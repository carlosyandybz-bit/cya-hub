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

const STUDENT_LABEL_THEME: Record<string, ModuleTheme> = {
  inicio: "student-home",
  progreso: "student-progress",
  "mi formación": "student-formation",
  descubre: "student-discover",
  misiones: "student-missions",
};

function studentTheme(): ModuleTheme | null {
  const portal = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
  if (!portal || getComputedStyle(portal).display === "none") return null;
  const buttons = [...portal.querySelectorAll<HTMLButtonElement>("button")];
  const active = buttons.find((button) =>
    button.getAttribute("aria-current") === "page"
    || button.getAttribute("aria-selected") === "true"
    || button.classList.contains("active")
  );
  const label = (active?.textContent || "Inicio").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
  return STUDENT_LABEL_THEME[label] ?? "student-home";
}

function resolveTheme(): ModuleTheme {
  const portalTheme = studentTheme();
  if (portalTheme) return portalTheme;
  const state = window.history.state as { view?: string; experience?: string } | null;
  if (state?.experience === "admin") return "admin";
  return STAFF_VIEW_THEME[state?.view ?? "home"] ?? "home";
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
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
