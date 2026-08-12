import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`P22 codemod: no se encontró ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`P22 codemod: ${label} no es único`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`P22 codemod: no se encontró inicio de ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`P22 codemod: no se encontró final de ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const cyaPath = 'app/cya-app.tsx';
let cya = fs.readFileSync(cyaPath, 'utf8');

cya = replaceOnce(
  cya,
  '  evaluations: Array<{ id: number; class_id: number | null; score: number; aptitude: string; created_at: string }>;\n',
  '  evaluations: Array<{ id: number; session_id: number | null; class_id: number | null; score: number; aptitude_term_id: number; aptitude: string; style_term_id: number; style: string; role_term_id: number; role: string; level_term_id: number; level: string; evaluation_kind: string; created_at: string }>;\n',
  'tipo de evaluaciones del portal',
);

cya = replaceOnce(
  cya,
  '  const activeAssignments = snapshot.assignments.filter((assignment) => !["corrected", "completed"].includes(assignment.assignment_status));\n',
  '  const activeAssignments = snapshot.assignments.filter((assignment) => !["corrected", "explained", "completed"].includes(assignment.assignment_status));\n',
  'conteo de formación activa',
);

cya = replaceOnce(
  cya,
  '  const latestScores = [...snapshot.evaluations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).reduce<Map<string, StudentPortalSnapshot["evaluations"][number]>>((map, item) => map.has(item.aptitude) ? map : map.set(item.aptitude, item), new Map());\n  const totalScore = [...latestScores.values()].reduce((sum,item) => sum + Number(item.score || 0),0);\n  const relativeRadar = [...latestScores.values()].map((item) => ({ label:item.aptitude, value:totalScore ? Number(item.score) / totalScore * 100 : 0 }));\n',
  '  const orderedEvaluations = [...snapshot.evaluations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());\n  const latestEvaluation = orderedEvaluations[0] ?? null;\n  const contextEvaluations = latestEvaluation ? orderedEvaluations.filter((item) => item.style_term_id === latestEvaluation.style_term_id && item.role_term_id === latestEvaluation.role_term_id && item.level_term_id === latestEvaluation.level_term_id) : orderedEvaluations;\n  const latestScores = contextEvaluations.reduce<Map<string, StudentPortalSnapshot["evaluations"][number]>>((map, item) => map.has(item.aptitude) ? map : map.set(item.aptitude, item), new Map());\n  const totalScore = [...latestScores.values()].reduce((sum,item) => sum + Number(item.score || 0),0);\n  const relativeRadar = [...latestScores.values()].map((item) => ({ label:item.aptitude, value:totalScore ? Number(item.score) / totalScore * 100 : 0 }));\n  const evolutionContextLabel = latestEvaluation ? [latestEvaluation.style, latestEvaluation.role, latestEvaluation.level].filter(Boolean).join(" · ") : "Último contexto";\n',
  'cálculo contextual de evolución',
);

cya = replaceOnce(
  cya,
  '<div className="card-head"><h2>Mi evolución</h2><span>Reparto relativo</span></div>',
  '<div className="card-head"><h2>Mi evolución</h2><span>{evolutionContextLabel}</span></div>',
  'etiqueta del contexto de evolución',
);

cya = replaceOnce(
  cya,
  'snapshot.evaluations.slice(0,12).map((item)',
  'contextEvaluations.slice(0,12).map((item)',
  'histórico contextual de evaluación',
);

const statusFunction = `function portalClassStatus(value: string) {\n  return ({ scheduled: "Programada", active: "En curso", finished: "Realizada", cancelled: "Cancelada" } as Record<string, string>)[value] ?? value;\n}\n`;
const statusWithRow = `${statusFunction}\nfunction PortalClassRow({ item }: { item: StudentPortalSnapshot["classes"][number] }) {\n  const billingNote = item.billing_status === "accepted_uncovered" && item.uncovered_minutes ? \` · aceptado sin regularizar \${minutesLabel(item.uncovered_minutes)}\` : item.uncovered_minutes ? \` · pendiente \${minutesLabel(item.uncovered_minutes)}\` : "";\n  return <div><CalendarDays /><div><strong>{item.style || (item.class_type === "pair" ? "Clase en pareja" : "Clase individual")}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}{billingNote}</span></div><span className={\`badge \${item.status === "finished" ? "portal" : ""}\`}>{portalClassStatus(item.status)}</span></div>;\n}\n`;
cya = replaceOnce(cya, statusFunction, statusWithRow, 'fila reutilizable del historial');

const classStart = '      <article className="card portal-card"><div className="card-head"><h2>Mis clases</h2><span>{snapshot.classes.length}</span></div>{snapshot.classes.length ? <div className="portal-class-list">';
const classEnd = '</div> : <div className="compact-empty"><CalendarDays /><span>Todavía no hay clases en tu historial.</span></div>}</article>';
const classReplacement = `${classStart}{snapshot.classes.slice(0, 8).map((item) => <PortalClassRow key={item.id} item={item} />)}{snapshot.classes.length > 8 ? <details className="portal-history-more"><summary>Ver {snapshot.classes.length - 8} clases anteriores</summary><div className="portal-class-list">{snapshot.classes.slice(8).map((item) => <PortalClassRow key={item.id} item={item} />)}</div></details> : null}`;
cya = replaceRange(cya, classStart, classEnd, classReplacement, 'historial completo de clases');

fs.writeFileSync(cyaPath, cya);

const accountPath = 'app/account-pages.tsx';
let account = fs.readFileSync(accountPath, 'utf8');
account = replaceOnce(
  account,
  'import type { ExperienceContext, IdentityContext } from "./v14-types";\n',
  'import type { ExperienceContext, IdentityContext } from "./v14-types";\nimport { RuntimeForm } from "./runtime-form";\n',
  'import de RuntimeForm',
);
account = replaceOnce(
  account,
  '<p>Gestiona tu nombre y tu foto de perfil.</p>',
  '<p>Gestiona tu cuenta y, si eres alumno, tus datos personales canónicos.</p>',
  'descripción de perfil',
);

const profileEnd = `      </form>\n    </section>\n  );\n}\n\nexport function PreferencesSettingsView`;
const profileExpanded = `      </form>\n\n      {identity.can_study ? <section className={styles.card} aria-labelledby="student-profile-data-title">\n        <div className={styles.sectionTitle}><UserRound /><div><strong id="student-profile-data-title">Mis datos de alumno</strong><span>Información compartida con tu ficha CYA, sin volver a escribir lo que ya conocemos.</span></div></div>\n        <RuntimeForm client={client} formKey="student_personal" mode="edit" submitLabel="Guardar datos de alumno" compact onSaved={() => notify("Datos de alumno actualizados.")} />\n      </section> : null}\n    </section>\n  );\n}\n\nexport function PreferencesSettingsView`;
account = replaceOnce(account, profileEnd, profileExpanded, 'formulario canónico en perfil');
fs.writeFileSync(accountPath, account);

console.log('P22 portal codemod aplicado correctamente.');
