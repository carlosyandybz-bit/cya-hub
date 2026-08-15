from pathlib import Path

portal_path = Path('app/student-portal-prf.tsx')
portal = portal_path.read_text(encoding='utf-8')

anchor = '''  const latestScores = useMemo(() => {
    const map = new Map<number, PortalEvaluation>();
    for (const item of snapshot?.evaluations ?? []) if (!map.has(item.aptitude_term_id)) map.set(item.aptitude_term_id, item);
    return [...map.values()];
  }, [snapshot?.evaluations]);
'''
if anchor not in portal:
    raise SystemExit('latestScores anchor not found')

progress_derivations = anchor + '''
  const evaluationTimeline = useMemo(
    () => [...(snapshot?.evaluations ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [snapshot?.evaluations],
  );
  const improvements = useMemo(() => {
    const byAptitude = new Map<number, PortalEvaluation[]>();
    for (const item of evaluationTimeline) {
      const history = byAptitude.get(item.aptitude_term_id) ?? [];
      history.push(item);
      byAptitude.set(item.aptitude_term_id, history);
    }
    return [...byAptitude.values()].flatMap((history) => {
      const latest = history[0];
      const previous = history[1];
      if (!latest || !previous || latest.score <= previous.score) return [];
      return [{ latest, previous, delta: latest.score - previous.score }];
    });
  }, [evaluationTimeline]);
  const progressMilestones = useMemo(() => {
    const finishedClasses = snapshot?.classes.filter((item) => item.status === "finished").length ?? 0;
    const evaluationCount = snapshot?.evaluations.length ?? 0;
    const contentCount = snapshot?.assignments.length ?? 0;
    const milestones: Array<{ key: string; title: string; detail: string }> = [];
    if (finishedClasses >= 1) milestones.push({ key: "first-class", title: "Primera clase completada", detail: `${finishedClasses} ${finishedClasses === 1 ? "clase realizada" : "clases realizadas"}` });
    if (finishedClasses >= 5) milestones.push({ key: "five-classes", title: "5 clases completadas", detail: `${finishedClasses} clases realizadas hasta ahora` });
    if (finishedClasses >= 10) milestones.push({ key: "ten-classes", title: "10 clases completadas", detail: `${finishedClasses} clases realizadas hasta ahora` });
    if (evaluationCount >= 1) milestones.push({ key: "first-evaluation", title: "Primera evaluación registrada", detail: `${evaluationCount} ${evaluationCount === 1 ? "registro de evaluación" : "registros de evaluación"}` });
    if (contentCount >= 5) milestones.push({ key: "five-contents", title: "5 contenidos en tu espacio", detail: `${contentCount} contenidos forman parte de tu formación` });
    return milestones;
  }, [snapshot?.assignments.length, snapshot?.classes, snapshot?.evaluations.length]);
  const progressVideos = useMemo(() => {
    const personal = privateVideos.map((video) => ({
      key: `private-${video.id}`,
      fileId: video.external_file_id,
      title: video.title || "Vídeo de clase",
      createdAt: video.created_at,
    }));
    const classVideos = (snapshot?.class_media ?? [])
      .filter((media) => media.media_type === "video")
      .map((media) => ({
        key: `class-${media.id}`,
        fileId: media.external_file_id,
        title: media.title || (media.media_kind === "final_dance" ? "Baile final" : "Vídeo de clase"),
        createdAt: media.created_at,
      }));
    return [...personal, ...classVideos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [privateVideos, snapshot?.class_media]);
'''
portal = portal.replace(anchor, progress_derivations, 1)

start_marker = '      {screen === "progress" ?'
end_marker = '\n\n      {screen === "formation" ?'
start = portal.find(start_marker)
end = portal.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('progress screen markers not found')

new_progress = '''      {screen === "progress" ? <section className={styles.pageSection}>
        <header className={styles.pageHeading}><span>PROGRESO</span><h1>En qué enfocarte ahora</h1><p>Primero lo que te ayuda hoy; después, toda tu evolución.</p></header>
        <div className={styles.focusList}>{activeAssignments.slice(0, 3).map((item) => <article key={item.id}><Target /><div><span>{contentTypeLabels[item.content_type] ?? item.content_type}</span><strong>{item.title}</strong><small>{assignmentStateLabels[item.assignment_status] ?? item.assignment_status}</small></div></article>)}{!activeAssignments.length ? <p className={styles.emptyText}>Ahora mismo no tienes nada marcado como prioritario. Eso también significa que puedes elegir por dónde seguir.</p> : null}</div>

        <div className={styles.homeColumns}>
          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>TU EVALUACIÓN</span><h2>Última foto de tu progreso</h2></div><strong>{latestScores.length}</strong></div>{latestScores.length ? <div className={styles.scoreList}>{latestScores.map((item) => <div key={item.aptitude_term_id}><span>{item.aptitude}</span><strong>{item.score}</strong></div>)}</div> : <p className={styles.emptyText}>Aún no hemos guardado una evaluación completa. Tu progreso puede seguir construyéndose mientras tanto.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>DESDE LA ANTERIOR</span><h2>Qué ha mejorado</h2></div><strong>{improvements.length}</strong></div>{improvements.length ? <div className={styles.activityList}>{improvements.map(({ latest, previous, delta }) => <div key={latest.aptitude_term_id}><TrendingUp /><span><strong>{latest.aptitude}</strong><small>{previous.score} → {latest.score} · +{delta} puntos</small></span></div>)}</div> : <p className={styles.emptyText}>Cuando tengamos dos evaluaciones comparables, aquí verás únicamente mejoras respaldadas por tus datos.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>EVOLUCIÓN</span><h2>Cómo ha ido cambiando</h2></div><strong>{evaluationTimeline.length}</strong></div>{evaluationTimeline.length ? <div className={styles.activityList}>{evaluationTimeline.slice(0, 10).map((item) => <div key={item.id}><CalendarDays /><span><strong>{item.aptitude} · {item.score}</strong><small>{item.style} · {item.level} · {dateLabel(item.created_at, false)}</small></span></div>)}</div> : <p className={styles.emptyText}>Tu historial de evaluación aparecerá aquí a medida que vayamos guardando nuevas fotos de tu progreso.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>HITOS</span><h2>Pasos que ya forman parte de tu camino</h2></div><strong>{progressMilestones.length}</strong></div>{progressMilestones.length ? <div className={styles.activityList}>{progressMilestones.map((milestone) => <div key={milestone.key}><CircleCheck /><span><strong>{milestone.title}</strong><small>{milestone.detail}</small></span></div>)}</div> : <p className={styles.emptyText}>Tus primeros hitos aparecerán aquí cuando exista actividad real suficiente para reconocerlos.</p>}</article>
        </div>

        <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>MULTIMEDIA</span><h2>Mis vídeos</h2></div><strong>{progressVideos.length}</strong></div>{progressVideos.length ? <div className={styles.homeColumns}>{progressVideos.slice(0, 12).map((video) => <div key={video.key}><SecureDriveAsset fileId={video.fileId} mediaType="video" title={video.title} controls className={styles.prepVideo} /><p className={styles.emptyText}>{video.title} · {dateLabel(video.createdAt, false)}</p></div>)}</div> : <p className={styles.emptyText}>Cuando tengas vídeos personales de evolución o vídeos guardados de clase, los tendrás reunidos aquí.</p>}</article>
      </section> : null}'''
portal = portal[:start] + new_progress + portal[end:]
portal_path.write_text(portal, encoding='utf-8')

test_path = Path('tests/postrelease-global-redesign.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
progress_test = '''\n\ntest("Progreso final derives improvements evolution milestones and videos from real portal data", () => {
  assert.match(portal, /<h2>Qué ha mejorado<\\/h2>/);
  assert.match(portal, /latest\.score - previous\.score/);
  assert.match(portal, /latest\.score <= previous\.score/);
  assert.match(portal, /<h2>Cómo ha ido cambiando<\\/h2>/);
  assert.match(portal, /evaluationTimeline\.slice\(0, 10\)/);
  assert.match(portal, /<h2>Pasos que ya forman parte de tu camino<\\/h2>/);
  assert.match(portal, /finishedClasses >= 5/);
  assert.match(portal, /<h2>Mis vídeos<\\/h2>/);
  assert.match(portal, /progressVideos\.slice\(0, 12\)/);
  assert.match(portal, /media\.media_type === "video"/);
  assert.match(portal, /privateVideos\.map/);
  assert.doesNotMatch(portal, /has mejorado muchísimo|increíble progreso|vas genial/i);
});\n'''
if 'Progreso final derives improvements evolution milestones and videos' not in test_source:
    test_path.write_text(test_source + progress_test, encoding='utf-8')

qa_path = Path('qa/tests/prf-progress.spec.ts')
qa_path.write_text('''import { expect, test, type Page } from "@playwright/test";\n\nasync function loginStudent(page: Page) {\n  const email = process.env.QA_STUDENT_EMAIL;\n  const password = process.env.QA_STUDENT_PASSWORD;\n  if (!email || !password) throw new Error("QA student credentials are not configured");\n  await page.goto("/", { waitUntil: "domcontentloaded" });\n  await page.locator('input[name="email"]').fill(email);\n  await page.locator('input[name="password"]').fill(password);\n  await page.getByRole("button", { name: /^Entrar$/ }).click();\n  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });\n}\n\ntest("PR-F Progreso exposes the complete evidence-backed hierarchy without mobile overflow", async ({ page }) => {\n  await loginStudent(page);\n  await page.getByRole("button", { name: /^Progreso$/ }).click();\n  await expect(page.getByRole("heading", { name: "En qué enfocarte ahora" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Última foto de tu progreso" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Qué ha mejorado" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Cómo ha ido cambiando" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Pasos que ya forman parte de tu camino" })).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Mis vídeos" })).toBeVisible();\n  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);\n  expect(overflow).toBe(false);\n});\n''', encoding='utf-8')

print('PR-F progress final patch applied')
