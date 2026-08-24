import type { Mission } from "./v14-types";

export type MissionDestination = {
  view: string;
  personId?: number;
  classId?: number;
  contentId?: number;
  grantId?: number;
  personTab?: "summary" | "learning" | "evaluation" | "classes" | "credits" | "data" | "crm";
  highlight: string;
  exact: boolean;
};

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function baseTarget(value: string | null | undefined) {
  return value?.split(":", 1)[0] || "home";
}

export function missionTypeLabel(type: Mission["mission_type"]) {
  if (type === "daily") return "Diaria";
  if (type === "growth") return "Progreso";
  return "Puntual";
}

export function missionDestination(mission: Mission): MissionDestination {
  const origin = mission.origin ?? {};
  const sourceId = numberValue(mission.source_id);
  const personId = numberValue(origin.person_id) ?? numberValue(origin.source_person_id) ?? (mission.source_domain === "person" ? sourceId : undefined);
  const classId = numberValue(origin.class_id) ?? (mission.source_domain === "class" ? sourceId : undefined);
  const contentId = numberValue(origin.content_id) ?? (mission.source_domain === "teaching_content" ? sourceId : undefined);
  const grantId = numberValue(origin.grant_id) ?? (mission.source_domain === "credit_grant" ? sourceId : undefined);

  if (classId) return { view: "live", classId, personId, highlight: mission.rule_key?.includes("pending_close") ? "pedagogy-close" : "class-action", exact: true };
  if (personId) {
    const needsIdentityAction = Boolean(mission.rule_key && /(duplicate|merge|incomplete)/.test(mission.rule_key));
    return { view: "students", personId, personTab: needsIdentityAction ? "data" : "summary", highlight: needsIdentityAction ? "person-data" : "person-header", exact: true };
  }
  if (contentId) return { view: "teaching", contentId, highlight: `teaching-content-${contentId}`, exact: true };
  if (grantId) return { view: "credits", grantId, highlight: `credit-grant-${grantId}`, exact: true };
  if (mission.rule_key === "daily.add_correction") return { view: "teaching", highlight: "create-correction", exact: true };

  const target = baseTarget(mission.action_target);
  return { view: target, highlight: `${target}-primary-action`, exact: false };
}
