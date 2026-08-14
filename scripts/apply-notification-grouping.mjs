import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected fragment is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const path = "app/notifications-view.tsx";
let source = readFileSync(path, "utf8");

source = replaceOnce(
  source,
  `const groupedRuleLabels: Record<string, string> = {\n  "classes.pending_close": "Clases pendientes de cerrar",\n  "classes.preparation": "Clases que necesitan preparación",\n  "credits.low_balance": "Bonos con saldo bajo",\n  "credits.expiry": "Bonos que necesitan revisión",\n  "students.incomplete_profile": "Perfiles de alumnos por completar",\n  "corrections.missing_explanation": "Correcciones por completar",\n  "daily.add_correction": "Contenido diario por añadir",\n  "daily.review_information": "Información pendiente de revisar",\n};`,
  `const groupedRuleLabels: Record<string, string> = {\n  "classes.pending_close": "Clases pendientes de cerrar",\n  "classes.preparation": "Clases que necesitan preparación",\n  "classes.preparation_needed": "Clases que necesitan preparación",\n  "credits.low_balance": "Bonos con saldo bajo",\n  "credits.expiry": "Bonos que necesitan revisión",\n  "bonuses.low_or_expiring": "Bonos que necesitan revisión",\n  "students.incomplete_profile": "Perfiles de alumnos por completar",\n  "corrections.missing_explanation": "Correcciones por completar",\n  "daily.add_correction": "Contenido diario por añadir",\n  "daily.review_information": "Información pendiente de revisar",\n};`,
  "real rule labels",
);

source = replaceOnce(
  source,
  `function sourceLabel(item: EnrichedNotification) {\n  const source = item.mission?.source_domain;\n  if (source === "class") return "Clase";\n  if (source === "person") return "Alumno";\n  if (source === "teaching_content") return "Enseñanza";\n  if (source === "daily") return "CYA";\n  return "Aviso";\n}`,
  `function sourceLabel(item: EnrichedNotification) {\n  const source = item.mission?.source_domain;\n  if (source === "class") return "Clase";\n  if (source === "person") return "Alumno";\n  if (source === "teaching_content") return "Enseñanza";\n  if (source === "credit_grant") return "Bono";\n  if (source === "daily") return "CYA";\n  return "Aviso";\n}`,
  "credit source label",
);

source = replaceOnce(
  source,
  `function semanticKey(item: EnrichedNotification) {\n  const target = item.mission?.action_target ?? item.action_target ?? "none";\n  if (item.mission?.rule_key) return \`mission:\${item.mission.rule_key}:\${target}\`;\n  return \`event:\${item.event_key || item.source_type || "notice"}:\${target}\`;\n}\n\nfunction groupLabel(cluster: NotificationCluster) {\n  const rule = cluster.representative.mission?.rule_key;\n  if (rule && groupedRuleLabels[rule]) return groupedRuleLabels[rule];\n  if (cluster.items.length === 1) return cluster.representative.title;\n  return \`\${sourceLabel(cluster.representative)} · \${cluster.items.length} avisos\`;\n}`,
  `function entityKey(item: EnrichedNotification) {\n  const mission = item.mission;\n  if (mission?.source_domain && mission.source_id) return \`\${mission.source_domain}:\${mission.source_id}\`;\n  const origin = mission?.origin ?? {};\n  const originEntity = [\n    ["person", origin.person_id],\n    ["class", origin.class_id],\n    ["teaching_content", origin.content_id],\n    ["credit_grant", origin.grant_id],\n  ].find(([, value]) => value !== undefined && value !== null);\n  if (originEntity) return \`\${originEntity[0]}:\${String(originEntity[1])}\`;\n  if (item.source_type && item.source_id) return \`\${item.source_type}:\${item.source_id}\`;\n  return \`event:\${item.event_key || item.source_type || "notice"}\`;\n}\n\nfunction semanticKey(item: EnrichedNotification) {\n  const target = item.mission?.action_target ?? item.action_target ?? "none";\n  const entity = entityKey(item);\n  if (item.mission?.rule_key) return \`mission:\${entity}:\${item.mission.rule_key}:\${target}\`;\n  return \`event:\${entity}:\${item.event_key || item.source_type || "notice"}:\${target}\`;\n}\n\nfunction groupLabel(cluster: NotificationCluster) {\n  const titles = new Set(cluster.items.map((item) => item.title));\n  if (titles.size === 1) return cluster.representative.title;\n  const rule = cluster.representative.mission?.rule_key;\n  if (rule && groupedRuleLabels[rule]) return groupedRuleLabels[rule];\n  if (cluster.items.length === 1) return cluster.representative.title;\n  return \`\${sourceLabel(cluster.representative)} · \${cluster.items.length} avisos\`;\n}`,
  "entity-aware grouping",
);

writeFileSync(path, source);

writeFileSync("tests/notification-grouping.test.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst notifications=readFileSync("app/notifications-view.tsx","utf8");\n\ntest("notification clusters include the concrete source entity",()=>{\n  assert.match(notifications,/function entityKey\\(item: EnrichedNotification\\)/);\n  assert.match(notifications,/mission\\?\\.source_domain && mission\\.source_id/);\n  assert.match(notifications,/mission:\\$\\{entity\\}:\\$\\{item\\.mission\\.rule_key\\}:\\$\\{target\\}/);\n  assert.doesNotMatch(notifications,/mission:\\$\\{item\\.mission\\.rule_key\\}:\\$\\{target\\}/);\n});\n\ntest("group labels preserve the concrete title for duplicate notices of one entity",()=>{\n  assert.match(notifications,/const titles = new Set\\(cluster\\.items\\.map\\(\\(item\\) => item\\.title\\)\\)/);\n  assert.match(notifications,/if \\(titles\\.size === 1\\) return cluster\\.representative\\.title/);\n});\n\ntest("current production rule aliases have product labels",()=>{\n  assert.match(notifications,/"classes\\.preparation_needed": "Clases que necesitan preparación"/);\n  assert.match(notifications,/"bonuses\\.low_or_expiring": "Bonos que necesitan revisión"/);\n  assert.match(notifications,/source === "credit_grant"\\) return "Bono"/);\n});\n`);

console.log("Entity-aware notification grouping applied exactly once.");
