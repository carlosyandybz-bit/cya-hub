"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeSupabaseClient } from "./supabase-runtime";

type ClassPreference = {
  person_id: number;
  default_location_term_id: number | null;
  default_location_text: string | null;
  default_style_term_id: number | null;
  default_role_term_id: number | null;
  default_duration_minutes: number | null;
  default_class_type: "individual" | "pair" | null;
  default_partner_person_id: number | null;
};

type PersonLite = { id: number; display_name: string };

const hydratedSchedule = new WeakMap<Element, number>();
const hydratedSetup = new WeakMap<Element, string>();

function text(node: Element | null) {
  return node?.textContent?.trim() ?? "";
}

function setNativeValue(control: HTMLInputElement | HTMLSelectElement, value: string) {
  if (control.value === value) return;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function labelControl(root: ParentNode, label: string) {
  const labels = Array.from(root.querySelectorAll("label"));
  const target = labels.find((item) => text(item.querySelector(":scope > span")) === label || text(item.querySelector("span")) === label);
  return target?.querySelector("input,select") as HTMLInputElement | HTMLSelectElement | null;
}

function scheduleModal() {
  return Array.from(document.querySelectorAll("section.modal")).find((modal) => text(modal.querySelector("h2")) === "Programar clase") ?? null;
}

function setupPage() {
  return Array.from(document.querySelectorAll(".class-workflow-page")).find((page) => text(page.querySelector(".workflow-head .eyebrow")) === "1 · Datos") ?? null;
}

async function getPreferences(client: SupabaseClient, personIds: number[]) {
  if (!personIds.length) return [] as ClassPreference[];
  const result = await client
    .from("student_class_preferences")
    .select("person_id,default_location_term_id,default_location_text,default_style_term_id,default_role_term_id,default_duration_minutes,default_class_type,default_partner_person_id")
    .in("person_id", personIds);
  return result.error ? [] as ClassPreference[] : (result.data ?? []) as ClassPreference[];
}

async function hydrateScheduleModal(client: SupabaseClient, modal: Element) {
  const first = modal.querySelector('select[name="student_1"]') as HTMLSelectElement | null;
  if (!first?.value) return;
  const personId = Number(first.value);
  if (!personId || hydratedSchedule.get(modal) === personId) return;
  hydratedSchedule.set(modal, personId);

  const [preference] = await getPreferences(client, [personId]);
  if (!preference || !document.contains(modal) || Number(first.value) !== personId) return;

  if (preference.default_class_type) {
    const wanted = preference.default_class_type === "pair" ? "Pareja" : "Individual";
    const button = Array.from(modal.querySelectorAll(".segmented button")).find((item) => text(item) === wanted) as HTMLButtonElement | undefined;
    if (button && !button.classList.contains("active")) button.click();
  }

  if (preference.default_duration_minutes && preference.default_duration_minutes > 0) {
    const hours = modal.querySelector('input[name="hours"]') as HTMLInputElement | null;
    const minutes = modal.querySelector('input[name="minutes"]') as HTMLInputElement | null;
    if (hours) setNativeValue(hours, String(Math.floor(preference.default_duration_minutes / 60)));
    if (minutes) setNativeValue(minutes, String(preference.default_duration_minutes % 60));
  }

  const style = modal.querySelector('select[name="style_term_id"]') as HTMLSelectElement | null;
  if (style && preference.default_style_term_id && Array.from(style.options).some((option) => Number(option.value) === preference.default_style_term_id)) {
    setNativeValue(style, String(preference.default_style_term_id));
  }

  if (preference.default_class_type === "pair" && preference.default_partner_person_id) {
    window.requestAnimationFrame(() => {
      const currentModal = scheduleModal();
      if (currentModal !== modal) return;
      const second = modal.querySelector('select[name="student_2"]') as HTMLSelectElement | null;
      if (!second || preference.default_partner_person_id === personId) return;
      if (Array.from(second.options).some((option) => Number(option.value) === preference.default_partner_person_id)) {
        setNativeValue(second, String(preference.default_partner_person_id));
      }
    });
  }
}

async function resolveLocation(client: SupabaseClient, preference: ClassPreference) {
  const direct = preference.default_location_text?.trim();
  if (direct) return direct;
  if (!preference.default_location_term_id) return null;
  const result = await client.from("catalog_terms").select("label").eq("id", preference.default_location_term_id).maybeSingle();
  return result.error ? null : String(result.data?.label ?? "").trim() || null;
}

async function resolveVisiblePeople(client: SupabaseClient, page: Element) {
  const heading = text(page.querySelector(".workflow-head h1"));
  const visibleNames = heading.split(" + ").map((value) => value.trim()).filter(Boolean);
  if (!visibleNames.length || new Set(visibleNames).size !== visibleNames.length) return [] as PersonLite[];
  const result = await client.from("people").select("id,display_name").in("display_name", visibleNames).eq("active", true);
  if (result.error) return [] as PersonLite[];
  const rows = (result.data ?? []) as PersonLite[];
  if (rows.length !== visibleNames.length) return [] as PersonLite[];
  if (new Set(rows.map((row) => row.display_name.trim())).size !== rows.length) return [] as PersonLite[];
  return rows;
}

async function hydrateSetupPage(client: SupabaseClient, page: Element) {
  const heading = text(page.querySelector(".workflow-head h1"));
  if (!heading || hydratedSetup.get(page) === heading) return;
  hydratedSetup.set(page, heading);

  const people = await resolveVisiblePeople(client, page);
  if (!people.length || !document.contains(page)) return;
  const preferences = await getPreferences(client, people.map((person) => person.id));
  if (!preferences.length || !document.contains(page)) return;

  const resolved = await Promise.all(preferences.map((preference) => resolveLocation(client, preference)));
  const locations = [...new Set(resolved.filter((value): value is string => Boolean(value)))];
  if (locations.length === 1) {
    let locationControl = labelControl(page, "Lugar");
    if (!locationControl) {
      const knownLocation = Array.from(page.querySelectorAll(".setup-known-list span")).some((item) => text(item.querySelector("strong")) === "Lugar");
      if (!knownLocation) {
        const edit = page.querySelector(".workflow-edit-data") as HTMLButtonElement | null;
        if (edit && text(edit).includes("Editar")) {
          edit.click();
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          locationControl = labelControl(page, "Lugar");
        }
      }
    }
    if (locationControl && !locationControl.value.trim()) setNativeValue(locationControl, locations[0]);
  }

  const cards = Array.from(page.querySelectorAll(".workflow-people .workflow-card"));
  for (const person of people) {
    const preference = preferences.find((item) => item.person_id === person.id);
    if (!preference?.default_role_term_id) continue;
    const card = cards.find((item) => text(item.querySelector(".prepare-summary strong")) === person.display_name.trim());
    if (!card) continue;
    const roleControl = labelControl(card, "Rol");
    if (roleControl instanceof HTMLSelectElement && Array.from(roleControl.options).some((option) => Number(option.value) === preference.default_role_term_id)) {
      setNativeValue(roleControl, String(preference.default_role_term_id));
    }
  }
}

export function ClassDefaultsHydrator() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let client: SupabaseClient | null = null;

    const hydrate = () => {
      if (disposed || !client) return;
      const modal = scheduleModal();
      if (modal) void hydrateScheduleModal(client, modal);
      const page = setupPage();
      if (page) void hydrateSetupPage(client, page);
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.name !== "student_1") return;
      const modal = target.closest("section.modal");
      if (modal && text(modal.querySelector("h2")) === "Programar clase") {
        hydratedSchedule.delete(modal);
        window.setTimeout(hydrate, 0);
      }
    };

    const connect = () => {
      client = getRuntimeSupabaseClient();
      if (!client) return false;
      observer = new MutationObserver(hydrate);
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("change", onChange, true);
      window.addEventListener("popstate", hydrate);
      hydrate();
      return true;
    };

    if (!connect()) {
      const timer = window.setInterval(() => {
        if (connect()) window.clearInterval(timer);
      }, 250);
      return () => {
        disposed = true;
        window.clearInterval(timer);
        observer?.disconnect();
        document.removeEventListener("change", onChange, true);
        window.removeEventListener("popstate", hydrate);
      };
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("popstate", hydrate);
    };
  }, []);

  return null;
}
