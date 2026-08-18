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

function actionLink(label: string, href: string, kind: "whatsapp" | "instagram") {
  const link = document.createElement("a");
  link.className = `btn ghost student-contact-action student-contact-${kind}`;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.setAttribute("aria-label", `Abrir ${label}`);
  return link;
}

export function StudentCardContactActions() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let people: ContactPerson[] = [];

    const render = () => {
      if (cancelled || !people.length) return;
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

    const start = async () => {
      const client = getRuntimeSupabaseClient();
      if (!client) {
        if (!cancelled) retryTimer = setTimeout(() => void start(), 350);
        return;
      }

      const result = await client
        .from("people")
        .select("id,display_name,phone,email,country_code,instagram_handle")
        .eq("active", true);
      if (cancelled || result.error) return;
      people = (result.data ?? []) as ContactPerson[];
      render();

      observer = new MutationObserver(render);
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener("cya:person-merged", render);
    };

    void start();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      observer?.disconnect();
      window.removeEventListener("cya:person-merged", render);
      document.querySelectorAll(".student-contact-action").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
