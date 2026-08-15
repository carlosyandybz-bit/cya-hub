from pathlib import Path

portal_path = Path('app/student-portal-prf.tsx')
portal = portal_path.read_text(encoding='utf-8')

anchor = '''  const missions = homeSnapshot?.missions ?? [];
  const currentMissions = missions.filter((item) => !["completed", "completed_automatically", "cancelled", "not_applicable"].includes(item.state));
  const priorityMission = currentMissions.find((item) => item.priority === "urgent") ?? currentMissions.find((item) => item.priority === "priority") ?? currentMissions[0] ?? null;
'''
if anchor not in portal:
    raise SystemExit('missions derivation anchor not found')

replacement = '''  const missions = homeSnapshot?.missions ?? [];
  const currentMissions = missions.filter((item) => !["completed", "completed_automatically", "cancelled", "not_applicable"].includes(item.state));
  const missionRank = (mission: Mission) => mission.priority === "urgent" ? 3 : mission.priority === "priority" ? 2 : 1;
  const sortMissions = (items: Mission[]) => [...items].sort((a, b) => missionRank(b) - missionRank(a) || b.priority_score - a.priority_score || (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER));
  const missionGroups = useMemo(() => {
    const visible = missions.filter((item) => !["cancelled", "not_applicable"].includes(item.state));
    const completed = sortMissions(visible.filter((item) => ["completed", "completed_automatically"].includes(item.state)));
    const inProgress = sortMissions(visible.filter((item) => item.state === "in_progress"));
    const now = sortMissions(visible.filter((item) => !["completed", "completed_automatically", "in_progress"].includes(item.state) && ["urgent", "priority"].includes(item.priority)));
    const nowIds = new Set(now.map((item) => item.id));
    const available = sortMissions(visible.filter((item) => !["completed", "completed_automatically", "in_progress"].includes(item.state) && !nowIds.has(item.id)));
    return { now, available, inProgress, completed };
  }, [missions]);
  const priorityMission = missionGroups.now[0] ?? missionGroups.inProgress[0] ?? missionGroups.available[0] ?? null;
'''
portal = portal.replace(anchor, replacement, 1)

start_marker = '      {screen === "missions" ?'
end_marker = '\n\n      {screen === "feedback" ?'
start = portal.find(start_marker)
end = portal.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('missions screen markers not found')

new_screen = '''      {screen === "missions" ? <section className={styles.pageSection}>
        <header className={styles.pageHeading}><span>MISIONES</span><h1>Pequeños pasos que sí cuentan</h1><p>Primero lo que merece atención; después, lo que puedes hacer cuando te venga bien.</p></header>
        {[
          { key: "now", label: "AHORA", title: "Prioritarias", items: missionGroups.now, empty: "No hay ninguna misión prioritaria ahora mismo." },
          { key: "available", label: "DISPONIBLES", title: "Para cuando te venga bien", items: missionGroups.available, empty: "No tienes más misiones disponibles ahora mismo." },
          { key: "progress", label: "EN PROGRESO", title: "Lo que ya has empezado", items: missionGroups.inProgress, empty: "No tienes ninguna misión en marcha." },
          { key: "completed", label: "COMPLETADAS", title: "Lo que ya has hecho", items: missionGroups.completed, empty: "Tus misiones completadas aparecerán aquí." },
        ].map((group) => <article className={styles.openSection} key={group.key}>
          <div className={styles.sectionHeading}><div><span>{group.label}</span><h2>{group.title}</h2></div><strong>{group.items.length}</strong></div>
          {group.items.length ? <div className={styles.missionList}>{group.items.map((mission) => {
            const canStart = ["available", "not_done", "postponed"].includes(mission.state);
            const canComplete = ["available", "not_done", "postponed", "in_progress"].includes(mission.state);
            const isCompleted = ["completed", "completed_automatically"].includes(mission.state);
            return <article key={mission.id}><div><span>{mission.priority === "urgent" ? "Urgente" : mission.priority === "priority" ? "Prioritaria" : mission.mission_type === "daily" ? "Misión diaria" : "Misión"}</span><h3>{mission.title}</h3><p>{mission.description || "Una acción para seguir avanzando."}</p><small>{missionStateLabel(mission)}{mission.due_at ? ` · ${dateLabel(mission.due_at)}` : ""}</small></div><div>{canStart ? <button type="button" onClick={() => void actOnMission(mission, "start")}>Empezar</button> : null}{canComplete ? <button type="button" onClick={() => void actOnMission(mission, "complete")}><Check /> Completar</button> : null}{isCompleted ? <CircleCheck aria-label="Completada" /> : null}</div></article>;
          })}</div> : <p className={styles.emptyText}>{group.empty}</p>}
        </article>)}
      </section> : null}'''
portal = portal[:start] + new_screen + portal[end:]
portal_path.write_text(portal, encoding='utf-8')

test_path = Path('tests/postrelease-global-redesign.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
contract = r'''\n\ntest("Misiones final groups the canonical engine without exposing invalid actions", () => {
  assert.match(portal, /title: "Prioritarias"/);
  assert.match(portal, /title: "Para cuando te venga bien"/);
  assert.match(portal, /title: "Lo que ya has empezado"/);
  assert.match(portal, /title: "Lo que ya has hecho"/);
  assert.match(portal, /\["cancelled", "not_applicable"\]/);
  assert.match(portal, /const canStart = \["available", "not_done", "postponed"\]/);
  assert.match(portal, /const canComplete = \["available", "not_done", "postponed", "in_progress"\]/);
  assert.doesNotMatch(portal, /mission\.state !== "in_progress" && !\["completed"/);
});\n'''
if 'Misiones final groups the canonical engine' not in test_source:
    test_path.write_text(test_source + contract, encoding='utf-8')

qa_path = Path('qa/tests/prf-missions.spec.ts')
qa_path.write_text('''import { expect, test, type Page } from "@playwright/test";\n\nasync function loginStudent(page: Page) {\n  const email = process.env.QA_STUDENT_EMAIL;\n  const password = process.env.QA_STUDENT_PASSWORD;\n  if (!email || !password) throw new Error("QA student credentials are not configured");\n  await page.goto("/", { waitUntil: "domcontentloaded" });\n  await page.locator('input[name="email"]').fill(email);\n  await page.locator('input[name="password"]').fill(password);\n  await page.getByRole("button", { name: /^Entrar$/ }).click();\n  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });\n}\n\ntest("PR-F Misiones exposes the four canonical groups without mobile overflow", async ({ page }) => {\n  await loginStudent(page);\n  await page.getByRole("button", { name: /^Misiones$/ }).click();\n  await expect(page.getByRole("heading", { name: "Prioritarias" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Para cuando te venga bien" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Lo que ya has empezado" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Lo que ya has hecho" })).toBeVisible();\n  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);\n  expect(overflow).toBe(false);\n});\n''', encoding='utf-8')

print('PR-F missions final patch applied')
