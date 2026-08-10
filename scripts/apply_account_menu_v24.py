from pathlib import Path

app_path = Path('app/cya-app.tsx')
css_path = Path('app/globals.css')
menu_css_path = Path('app/account-menu.module.css')
text = app_path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    'import { AgendaView } from "./agenda-view";\nimport { ContextSelector } from "./context-selector";\nimport { HomeView } from "./home-view";',
    'import { AgendaView } from "./agenda-view";\nimport { AccountMenu } from "./account-menu";\nimport { HomeView } from "./home-view";',
    'account menu import',
)

replace_once(
    'function StudentPortal({ identity, experience, onExperience }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void }) {',
    'function StudentPortal({ identity, experience, onExperience, client, email, onIdentityPatch }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void | Promise<void>; client: SupabaseClient; email: string; onIdentityPatch: (patch: Partial<IdentityContext>) => void }) {',
    'student portal signature',
)

replace_once(
    '  return <div className="student-portal-shell"><header className="student-portal-head"><Brand /><ContextSelector identity={identity} value={experience} onChange={onExperience} compact /><div><span>{snapshot.profile.display_name || identity.display_name}</span><button className="icon-btn" onClick={() => db?.auth.signOut()} aria-label="Cerrar sesión"><LogOut /></button></div></header><main className="student-portal-main">',
    '  return <div className="student-portal-shell"><header className="student-portal-head"><Brand /><div><span>{identity.profile_name || snapshot.profile.display_name || identity.display_name}</span><AccountMenu client={client} identity={identity} experience={experience} email={email} variant="header" onExperience={onExperience} onIdentityPatch={onIdentityPatch} notify={() => undefined} /></div></header><main className="student-portal-main">',
    'student portal header',
)

replace_once(
    '  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} />;\n  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} />;',
    '  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} client={db!} email={session.user.email ?? ""} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} />;\n  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} client={db!} email={session.user.email ?? ""} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} />;',
    'student portal calls',
)

replace_once(
    '    <aside className="sidebar"><Brand /><nav>{nav.map(([id, label, Icon]) => <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => navigateView(id)}><Icon />{label}</button>)}</nav>\n      <div className="side-bottom"><ContextSelector identity={identity} value={experience} onChange={setExperience} /></div>\n      <div className="side-user"><CircleUserRound /><div><strong>{identity.display_name}</strong><span>{identity.roles.map((role) => roleLabel(role)).join(" · ")}</span></div><button onClick={() => db?.auth.signOut()} aria-label="Cerrar sesión"><LogOut /></button></div>\n    </aside>',
    '    <aside className="sidebar"><Brand /><nav>{nav.map(([id, label, Icon]) => <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => navigateView(id)}><Icon />{label}</button>)}</nav>\n      <AccountMenu client={db!} identity={identity} experience={experience} email={session.user.email ?? ""} variant="sidebar" onExperience={setExperience} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} notify={setToast} />\n    </aside>',
    'desktop account menu',
)

replace_once(
    '    <div><header className="mobile-head"><div className="mobile-head-back">{view !== "home" ? <button className="mobile-back" type="button" onClick={() => goBack("home")} aria-label="Volver">‹</button> : null}</div><div className="mobile-head-brand"><Brand /></div><div className="mobile-head-actions"><button className="icon-btn" onClick={() => navigateView("home")} aria-label="Notificaciones"><Bell /></button>{identity.can_admin ? <button className="icon-btn" onClick={() => goTarget("admin")} aria-label="Cuenta y administración"><CircleUserRound /></button> : null}</div></header>\n      <main className="main"><div className="content">\n        {view !== "live" ? <div className="context-toolbar"><ContextSelector identity={identity} value={experience} onChange={setExperience} compact /></div> : null}',
    '    <div><header className="mobile-head"><div className="mobile-head-back">{view !== "home" ? <button className="mobile-back" type="button" onClick={() => goBack("home")} aria-label="Volver">‹</button> : null}</div><div className="mobile-head-brand"><Brand /></div><div className="mobile-head-actions"><button className="icon-btn" onClick={() => navigateView("home")} aria-label="Notificaciones"><Bell /></button><AccountMenu client={db!} identity={identity} experience={experience} email={session.user.email ?? ""} variant="header" onExperience={setExperience} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} notify={setToast} /></div></header>\n      <main className="main"><div className="content">',
    'mobile account menu and context toolbar removal',
)

app_path.write_text(text)

css = css_path.read_text()
marker = '/* v24 · avatar account menu integration */'
if marker in css:
    raise SystemExit('v24 global CSS already present')
css += '''\n\n/* v24 · avatar account menu integration */\n@media(max-width:900px){\n  .student-portal-head{display:flex;align-items:center;justify-content:space-between;grid-template-columns:none}\n  .student-portal-head>div:last-child{margin-left:auto;justify-self:auto}\n}\n'''
css_path.write_text(css)

menu_css = menu_css_path.read_text()
old = '.sidebarRoot{width:100%}'
new = '.sidebarRoot{width:100%;margin-top:auto;padding-top:16px;border-top:1px solid #e8e5ee}'
if menu_css.count(old) != 1:
    raise SystemExit(f'sidebar root CSS: expected 1 match, found {menu_css.count(old)}')
menu_css_path.write_text(menu_css.replace(old, new, 1))
