"use client";

import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { ExperienceContext, IdentityContext } from "./v14-types";

type ContextSelectorProps = {
  identity: IdentityContext;
  value: ExperienceContext;
  onChange: (value: ExperienceContext) => void;
  compact?: boolean;
};

export function ContextSelector({ identity, value, onChange, compact = false }: ContextSelectorProps) {
  const options: Array<{
    value: ExperienceContext;
    label: string;
    Icon: typeof UsersRound;
  }> = [];

  if (identity.can_teach) options.push({ value: "teacher", label: "Profesor", Icon: UsersRound });
  if (identity.can_study) options.push({ value: "student", label: "Alumno", Icon: UserRound });
  if (identity.can_admin) options.push({ value: "admin", label: "Administrador", Icon: ShieldCheck });

  if (options.length < 2) return null;

  return (
    <div className={`context-selector ${compact ? "compact" : ""}`}>
      {!compact ? <span>Ver como</span> : null}
      <div role="group" aria-label="Ver CYA Hub como">
        {options.map(({ value: option, label, Icon }) => (
          <button
            key={option}
            type="button"
            className={value === option ? "active" : ""}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <small>La vista cambia; tus permisos reales no.</small>
    </div>
  );
}
