"use client";

import type { LucideIcon } from "lucide-react";

type AdminNavigationSection<T extends string> = readonly [T, string, LucideIcon];

type AdminGroup<T extends string> = {
  id: "system" | "teaching" | "business" | "data" | "appearance";
  label: string;
  sectionIds: readonly T[];
};

const GROUP_DEFINITIONS = [
  { id: "system", label: "Sistema", sectionIds: ["general", "team", "security"] },
  { id: "teaching", label: "Enseñanza", sectionIds: ["forms", "teaching", "missions", "notifications"] },
  { id: "business", label: "Negocio", sectionIds: ["rates", "bz", "feedback", "academy"] },
  { id: "data", label: "Datos", sectionIds: ["data", "integrations"] },
  { id: "appearance", label: "Apariencia", sectionIds: ["appearance"] },
] as const;

export function AdminGroupedNavigation<T extends string>({
  section,
  sections,
  onSection,
}: {
  section: T;
  sections: ReadonlyArray<AdminNavigationSection<T>>;
  onSection: (section: T) => void;
}) {
  const sectionMap = new Map(sections.map((item) => [item[0], item]));
  const groups = GROUP_DEFINITIONS.map((group) => ({
    ...group,
    sectionIds: group.sectionIds.filter((id) => sectionMap.has(id as T)) as T[],
  })).filter((group) => group.sectionIds.length) as Array<AdminGroup<T>>;
  const activeGroup = groups.find((group) => group.sectionIds.includes(section)) ?? groups[0];

  return <aside className="admin-navigation" aria-label="Navegación de Administración">
    <nav className="admin-group-nav" aria-label="Áreas de Administración">
      {groups.map((group) => {
        const active = activeGroup?.id === group.id;
        const labels = group.sectionIds.map((id) => sectionMap.get(id)?.[1]).filter(Boolean).join(" · ");
        return <button
          key={group.id}
          type="button"
          className={active ? "active" : ""}
          aria-pressed={active}
          onClick={() => onSection(group.sectionIds[0])}
        >
          <strong>{group.label}</strong>
          <span>{labels}</span>
        </button>;
      })}
    </nav>

    {activeGroup ? <nav className="admin-local-nav" aria-label={`Opciones de ${activeGroup.label}`}>
      {activeGroup.sectionIds.map((id) => {
        const item = sectionMap.get(id);
        if (!item) return null;
        const [, label, Icon] = item;
        return <button
          key={id}
          type="button"
          className={section === id ? "active" : ""}
          aria-current={section === id ? "page" : undefined}
          onClick={() => onSection(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>;
      })}
    </nav> : null}
  </aside>;
}
