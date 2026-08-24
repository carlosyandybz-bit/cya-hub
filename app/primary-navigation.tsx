"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  House,
  LibraryBig,
  Megaphone,
  Target,
  UsersRound,
} from "lucide-react";
import { CyaIcon } from "./cya-icon";

const primaryModules = [
  { key: "home", label: "Inicio", fallback: House, iconKey: "navigation.home" },
  { key: "students", label: "Alumnado", fallback: UsersRound, iconKey: "navigation.students" },
  { key: "live", label: "Dar clase", fallback: GraduationCap, iconKey: "navigation.live" },
  { key: "teaching", label: "Enseñanza", fallback: LibraryBig, iconKey: "navigation.teaching" },
  { key: "academy", label: "Academia", fallback: GraduationCap, iconKey: "student.academy" },
] as const;

const secondaryModules = [
  { key: "agenda", label: "Agenda", fallback: CalendarDays, iconKey: "navigation.agenda" },
  { key: "statistics", label: "Estadísticas", fallback: BarChart3, iconKey: "marketing.statistics" },
  { key: "marketing", label: "Marketing", fallback: Megaphone, iconKey: "navigation.marketing" },
  { key: "notifications", label: "Notificaciones", fallback: Bell, iconKey: "navigation.notifications" },
  { key: "missions", label: "Misiones", fallback: Target, iconKey: "student.missions" },
] as const;

export function DesktopPrimaryNavigation({
  view,
  studentArea,
  notificationCount,
  missionCount,
  navigate,
}: {
  view: string;
  studentArea: boolean;
  notificationCount: number;
  missionCount: number;
  navigate: (view: string) => void;
}) {
  const isActive = (key: string) => key === "students" ? studentArea : view === key;

  return <nav aria-label="Módulos principales">
    {primaryModules.map((module) => <button key={module.key} className={isActive(module.key) ? "active" : ""} onClick={() => navigate(module.key)}>
      <CyaIcon iconKey={module.iconKey} fallback={module.fallback} />{module.label}
    </button>)}
    <details className="desktop-secondary-navigation">
      <summary aria-label="Abrir accesos secundarios de Dar clase"><ChevronDown /> Más</summary>
      <div role="menu" aria-label="Accesos secundarios de Dar clase">
        {secondaryModules.map((module) => {
          const count = module.key === "notifications" ? notificationCount : module.key === "missions" ? missionCount : 0;
          return <button key={module.key} role="menuitem" className={isActive(module.key) ? "active" : ""} onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            navigate(module.key);
          }}>
            <CyaIcon iconKey={module.iconKey} fallback={module.fallback} />
            <span>{module.label}</span>
            {count > 0 ? <strong className="navigation-count" aria-label={`${count} pendientes`}>{count > 99 ? "99+" : count}</strong> : null}
          </button>;
        })}
      </div>
    </details>
  </nav>;
}
