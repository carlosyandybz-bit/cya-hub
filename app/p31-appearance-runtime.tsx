"use client";

import { useEffect } from "react";

export type AppearanceSettings = {
  app_name: string;
  short_mark: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  typography: "geist" | "system" | "rounded";
  header_style: "standard" | "compact";
};

const typographyStacks: Record<AppearanceSettings["typography"], string> = {
  geist: 'var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  system: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",var(--font-geist-sans),sans-serif',
};

function softColor(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#f1edff";
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel * 0.1 + 255 * 0.9));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function ensureAppearanceStyles() {
  if (document.getElementById("cya-p31-appearance")) return;
  const style = document.createElement("style");
  style.id = "cya-p31-appearance";
  style.textContent = `
    body{font-family:var(--cya-font-family,var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
    .brand-mark{background-color:var(--purple);background-image:var(--cya-logo-image,none);background-position:center;background-repeat:no-repeat;background-size:contain;font-size:0}
    .brand-mark::after{content:var(--cya-short-mark,"CYA");font-size:12px;color:white}
    html[data-cya-logo="true"] .brand-mark::after{content:""}
    .brand>span:last-child{font-size:0}
    .brand>span:last-child::after{content:var(--cya-app-name,"CYA Hub");font-size:14px}
    html[data-cya-header="compact"] .page-head{margin-bottom:16px}
    html[data-cya-header="compact"] .page-head h1{font-size:clamp(26px,4vw,36px)}
    html[data-cya-header="compact"] .main{padding-top:24px}
  `;
  document.head.appendChild(style);
}

export function applyAppearanceSettings(settings: AppearanceSettings) {
  ensureAppearanceStyles();
  const root = document.documentElement;
  root.style.setProperty("--purple", settings.primary_color);
  root.style.setProperty("--purple2", settings.secondary_color);
  root.style.setProperty("--soft", softColor(settings.primary_color));
  root.style.setProperty("--cya-font-family", typographyStacks[settings.typography]);
  root.style.setProperty("--cya-app-name", JSON.stringify(settings.app_name.trim()));
  root.style.setProperty("--cya-short-mark", JSON.stringify(settings.short_mark.trim()));
  if (settings.logo_url) {
    root.style.setProperty("--cya-logo-image", `url(${JSON.stringify(settings.logo_url)})`);
    root.dataset.cyaLogo = "true";
  } else {
    root.style.removeProperty("--cya-logo-image");
    delete root.dataset.cyaLogo;
  }
  root.dataset.cyaHeader = settings.header_style;
  root.dataset.cyaTypography = settings.typography;
  document.title = settings.app_name;
}

export function P31AppearanceRuntime() {
  useEffect(() => {
    let active = true;
    void fetch("/api/appearance", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((settings: AppearanceSettings | null) => {
        if (active && settings) applyAppearanceSettings(settings);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return null;
}
