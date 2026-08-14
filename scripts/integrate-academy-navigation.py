from pathlib import Path


def checked(path: str, replacements: list[tuple[str, str]]) -> None:
    file = Path(path)
    text = file.read_text()
    for old, _ in replacements:
        if old not in text:
            raise SystemExit(f"Anchor not found in {path}: {old[:140]!r}")
    for old, new in replacements:
        text = text.replace(old, new, 1)
    file.write_text(text)


checked("app/cya-app.tsx", [
    (
        'import { FeedbackOnlineStaffQueue } from "./feedback-online-staff";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
        'import { FeedbackOnlineStaffQueue } from "./feedback-online-staff";\nimport { AcademyOnlineTeacherView } from "./academy-online-teacher";\nimport { AcademyOnlineStudentComingSoon } from "./academy-online-student";\nimport { DesktopPrimaryNavigation } from "./primary-navigation";\nimport { StatisticsView } from "./statistics-view";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
    ),
    (
        'type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin" | "profile" | "preferences" | "notifications";',
        'type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "statistics" | "academy" | "admin" | "profile" | "preferences" | "notifications";',
    ),
    (
        '    <FeedbackOnlineStudentPanel client={client} />\n    <section className="portal-grid">',
        '    <FeedbackOnlineStudentPanel client={client} />\n    <AcademyOnlineStudentComingSoon />\n    <section className="portal-grid">',
    ),
    (
        '    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing", "notifications"].includes(target)) navigateView(target as View);',
        '    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing", "statistics", "academy", "notifications"].includes(target)) navigateView(target as View);',
    ),
    (
        '    <aside className="sidebar"><Brand /><nav>{nav.map(([id, label, Icon]) => <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => navigateView(id)}><Icon />{label}</button>)}</nav>\n',
        '    <aside className="sidebar"><Brand /><DesktopPrimaryNavigation client={db!} view={view} studentArea={studentArea} navigate={(target) => navigateView(target as View)} />\n',
    ),
    (
        '        {view === "teaching" ? <TeachingView contents={teachingContents} relations={teachingRelations} assignments={teachingAssignments} students={students} terms={catalog} refresh={loadTeaching} notify={setToast} /> : null}\n        {view === "admin"',
        '        {view === "teaching" ? <TeachingView contents={teachingContents} relations={teachingRelations} assignments={teachingAssignments} students={students} terms={catalog} refresh={loadTeaching} notify={setToast} /> : null}\n        {view === "statistics" && db ? <StatisticsView client={db} leave={() => goBack("home")} notify={setToast} /> : null}\n        {view === "academy" && db ? <AcademyOnlineTeacherView client={db} identity={identity} notify={setToast} /> : null}\n        {view === "admin"',
    ),
])

checked("app/home-view.tsx", [
    (
        '      <button className="quick" onClick={() => go("teaching")}><BookOpen /><strong>Enseñanza</strong></button>\n      <button className="quick quick-wide" onClick={() => go("agenda")}',
        '      <button className="quick" onClick={() => go("teaching")}><BookOpen /><strong>Enseñanza</strong></button>\n      <button className="quick" onClick={() => go("academy")}><GraduationCap /><strong>Academia Online</strong></button>\n      <button className="quick quick-wide" onClick={() => go("agenda")}',
    ),
])

checked("app/admin-view.tsx", [
    (
        'import { FeedbackOnlineAdmin } from "./feedback-online-admin";\nimport { P0fEvaluationAdmin }',
        'import { FeedbackOnlineAdmin } from "./feedback-online-admin";\nimport { AcademyOnlineAdmin } from "./academy-online-admin";\nimport { P0fEvaluationAdmin }',
    ),
    (
        'type AdminSection = "general" | "team" | "forms" | "teaching" | "missions" | "bz" | "feedback" | "notifications" | "data" | "rates" | "integrations" | "appearance" | "security";',
        'type AdminSection = "general" | "team" | "forms" | "teaching" | "missions" | "bz" | "feedback" | "academy" | "notifications" | "data" | "rates" | "integrations" | "appearance" | "security";',
    ),
    (
        '  ["feedback", "Feedback Online", GraduationCap],\n  ["notifications", "Notificaciones", Bell],',
        '  ["feedback", "Feedback Online", GraduationCap],\n  ["academy", "Academia Online", GraduationCap],\n  ["notifications", "Notificaciones", Bell],',
    ),
    (
        '  function feedbackSection() {\n    return <FeedbackOnlineAdmin client={client} notify={notify} />;\n  }\n\n  function securitySection()',
        '  function feedbackSection() {\n    return <FeedbackOnlineAdmin client={client} notify={notify} />;\n  }\n\n  function academySection() {\n    return <AcademyOnlineAdmin client={client} notify={notify} />;\n  }\n\n  function securitySection()',
    ),
    (
        'section === "bz" ? bzSection() : section === "feedback" ? feedbackSection() : section === "notifications" ?',
        'section === "bz" ? bzSection() : section === "feedback" ? feedbackSection() : section === "academy" ? academySection() : section === "notifications" ?',
    ),
])
