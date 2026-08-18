"use client";

import { useEffect } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

type ContactPerson = {
  id: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  country_code: string | null;
  instagram_handle: string | null;
};

function whatsappNumber(phone: string, countryCode: string | null) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (countryCode === "ES" && digits.length === 9) digits = `34${digits}`;
  return digits.length >= 8 ? digits : null;
}

function uniquePersonForRow(row: Element, people: ContactPerson[]) {
  const name = row.querySelector(".student-main strong")?.textContent?.trim() ?? "";
  const contact = row.querySelector(".student-main span")?.textContent?.trim() ?? "";
  if (!name) return null;

  let candidates = people.filter((person) => person.display_name.trim() === name);
  if (contact && contact !== "Sin datos de contacto") {
    candidates = candidates.filter((person) => person.phone === contact || person.email === contact);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function whatsappMark() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#25D366" d="M16 2.6A13.15 13.15 0 0 0 4.73 22.55L3 29.4l7.02-1.84A13.16 13.16 0 1 0 16 2.6Z"/><path fill="#fff" d="M11.35 9.1c-.28-.62-.57-.63-.84-.64h-.72c-.25 0-.65.09-.99.46-.34.37-1.3 1.27-1.3 3.1s1.33 3.59 1.52 3.84c.19.25 2.62 4 6.35 5.61.89.38 1.58.61 2.12.78.89.28 1.7.24 2.34.15.71-.11 2.18-.89 2.49-1.75.31-.86.31-1.6.22-1.75-.09-.15-.34-.25-.71-.43-.37-.19-2.18-1.08-2.52-1.2-.34-.12-.59-.19-.84.19-.25.37-.96 1.2-1.18 1.45-.22.25-.43.28-.81.09-.37-.19-1.57-.58-3-1.85-1.11-.99-1.86-2.21-2.08-2.58-.22-.37-.02-.57.16-.75.17-.17.37-.43.56-.65.19-.22.25-.37.37-.62.12-.25.06-.46-.03-.65-.09-.19-.81-2.02-1.16-2.8Z"/></svg>`;
}

function instagramMark() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="cyaIgGradient" x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFDC80"/><stop offset=".24" stop-color="#FCAF45"/><stop offset=".48" stop-color="#F77737"/><stop offset=".68" stop-color="#F56040"/><stop offset=".82" stop-color="#C13584"/><stop offset="1" stop-color="#833AB4"/></linearGradient></defs><rect x="4" y="4" width="24" height="24" rx="7" fill="none" stroke="url(#cyaIgGradient)" stroke-width="3"/><circle cx="16" cy="16" r="5.5" fill="none" stroke="url(#cyaIgGradient)" stroke-width="3"/><circle cx="23.2" cy="8.8" r="1.8" fill="#C13584"/></svg>`;
}

function actionLink(label: string, href: string, kind: "whatsapp" | "instagram") {
  const link = document.createElement("a");
  link.className = `student-contact-action student-contact-${kind}`;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = kind === "whatsapp" ? whatsappMark() : instagramMark();
  link.setAttribute("aria-label", `Abrir ${label}`);
  link.setAttribute("title", label);
  return link;
}

export function StudentCardContactActions() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let people: ContactPerson[] = [];

    const render = () => {
      if (cancelled) return;
      document.querySelectorAll(".student-row").forEach((row) => {
        const actions = row.querySelector(".student-row-actions");
        if (!actions) return;
        actions.querySelectorAll(".student-contact-action").forEach((node) => node.remove());

        const person = uniquePersonForRow(row, people);
        if (!person) return;

        if (person.phone) {
          const number = whatsappNumber(person.phone, person.country_code);
          if (number) actions.append(actionLink("WhatsApp", `https://wa.me/${number}`, "whatsapp"));
        }
        if (person.instagram_handle) {
          const handle = person.instagram_handle.replace(/^@/, "").trim();
          if (handle) actions.append(actionLink("Instagram", `https://www.instagram.com/${encodeURIComponent(handle)}/`, "instagram"));
        }
      });
    };

    const loadPeople = async () => {
      const client = getRuntimeSupabaseClient();
      if (!client) return false;
      const result = await client
        .from("people")
        .select("id,display_name,phone,email,country_code,instagram_handle")
        .eq("active", true);
      if (cancelled || result.error) return false;
      people = (result.data ?? []) as ContactPerson[];
      render();
      return true;
    };

    const start = async () => {
      if (!(await loadPeople())) {
        if (!cancelled) retryTimer = setTimeout(() => void start(), 350);
        return;
      }

      observer = new MutationObserver((mutations) => {
        const studentRowsChanged = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
          node instanceof Element && (node.matches(".student-row") || Boolean(node.querySelector(".student-row")))
        ));
        if (studentRowsChanged) render();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };

    const refresh = () => { void loadPeople(); };
    void start();
    window.addEventListener("cya:person-merged", refresh);
    window.addEventListener("cya:student-contact-updated", refresh);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      observer?.disconnect();
      window.removeEventListener("cya:person-merged", refresh);
      window.removeEventListener("cya:student-contact-updated", refresh);
      document.querySelectorAll(".student-contact-action").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
