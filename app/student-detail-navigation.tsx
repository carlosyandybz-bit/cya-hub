"use client";

import styles from "./student-detail-navigation.module.css";

export type StudentDetailTab = "summary" | "learning" | "evaluation" | "classes" | "credits" | "data" | "crm";

type StudentDetailGroup = {
  id: "now" | "learning" | "history" | "profile";
  label: string;
  description: string;
  tabs: Array<{ id: StudentDetailTab; label: string }>;
};

export const STUDENT_DETAIL_GROUPS: StudentDetailGroup[] = [
  { id: "now", label: "Ahora", description: "Prioridad y contexto", tabs: [{ id: "summary", label: "Resumen" }] },
  { id: "learning", label: "Aprendizaje", description: "Formación y progreso", tabs: [{ id: "learning", label: "Formación" }, { id: "evaluation", label: "Evaluación" }] },
  { id: "history", label: "Historial", description: "Clases y saldo", tabs: [{ id: "classes", label: "Clases" }, { id: "credits", label: "Bonos" }] },
  { id: "profile", label: "Perfil", description: "Datos y gestión", tabs: [{ id: "data", label: "Datos" }, { id: "crm", label: "CRM" }] },
];

export function StudentDetailNavigation({ tab, onTab }: {
  tab: StudentDetailTab;
  onTab: (tab: StudentDetailTab) => void;
}) {
  const activeGroup = STUDENT_DETAIL_GROUPS.find((group) => group.tabs.some((item) => item.id === tab)) ?? STUDENT_DETAIL_GROUPS[0];

  function selectGroup(group: StudentDetailGroup) {
    if (!group.tabs.some((item) => item.id === tab)) onTab(group.tabs[0].id);
  }

  return <div className={styles.navigation} data-student-detail-tab={tab}>
    <nav className={styles.groupNav} aria-label="Áreas de la ficha del alumno">
      {STUDENT_DETAIL_GROUPS.map((group) => {
        const active = activeGroup.id === group.id;
        return <button
          key={group.id}
          type="button"
          className={active ? styles.activeGroup : ""}
          aria-pressed={active}
          onClick={() => selectGroup(group)}
        >
          <strong>{group.label}</strong>
          <span>{group.description}</span>
        </button>;
      })}
    </nav>

    {activeGroup.tabs.length > 1 ? <nav className={styles.localNav} aria-label={`Vistas de ${activeGroup.label}`}>
      {activeGroup.tabs.map((item) => <button
        key={item.id}
        type="button"
        className={tab === item.id ? styles.activeLocal : ""}
        aria-current={tab === item.id ? "page" : undefined}
        onClick={() => onTab(item.id)}
      >{item.label}</button>)}
    </nav> : null}
  </div>;
}
