from pathlib import Path

app_path = Path('app/cya-app.tsx')
css_path = Path('app/globals.css')
text = app_path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    'import { AccountMenu } from "./account-menu";\nimport { HomeView } from "./home-view";',
    'import { AccountMenu } from "./account-menu";\nimport { PreferencesSettingsView, ProfileSettingsView } from "./account-pages";\nimport { HomeView } from "./home-view";',
    'account pages import',
)
replace_once(
    'type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin";',
    'type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin" | "profile" | "preferences";',
    'view union',
)
replace_once(
    'function StudentPortal({ identity, experience, onExperience, client, email, onIdentityPatch }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void | Promise<void>; client: SupabaseClient; email: string; onIdentityPatch: (patch: Partial<IdentityContext>) => void }) {',
    'function StudentPortal({ identity, experience, onExperience, client, email, onIdentityPatch, onOpenProfile, onOpenPreferences }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void | Promise<void>; client: SupabaseClient; email: string; onIdentityPatch: (patch: Partial<IdentityContext>) => void; onOpenProfile: () => void; onOpenPreferences: () => void }) {',
    'student portal signature',
)
replace_once(
    '<AccountMenu client={client} identity={identity} experience={experience} email={email} variant="header" onExperience={onExperience} onIdentityPatch={onIdentityPatch} notify={() => undefined} />',
    '<AccountMenu client={client} identity={identity} experience={experience} email={email} variant="header" onExperience={onExperience} onOpenProfile={onOpenProfile} onOpenPreferences={onOpenPreferences} onIdentityPatch={onIdentityPatch} notify={() => undefined} />',
    'student portal account menu',
)
replace_once(
    '  const [toast, setToast] = useState<string>(""), [liveClassId, setLiveClassId] = useState<number | null>(null);\n  const loadStudents = useCallback(async () => {',
    '  const [toast, setToast] = useState<string>(""), [liveClassId, setLiveClassId] = useState<number | null>(null);\n  const patchIdentity = useCallback((patch: Partial<IdentityContext>) => setIdentity((current) => current ? { ...current, ...patch } : current), []);\n  const loadStudents = useCallback(async () => {',
    'stable identity patch',
)
old_returns = '''  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} client={db!} email={session.user.email ?? ""} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} />;\n  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} client={db!} email={session.user.email ?? ""} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} />;'''
new_returns = '''  const accountEmail = session.user.email ?? "";\n  if (view === "profile" || view === "preferences") return <div className="account-settings-shell">\n    <header className="account-settings-head">\n      <button className="mobile-back account-settings-back" type="button" onClick={() => goBack("home")} aria-label="Volver">‹</button>\n      <div className="account-settings-brand"><Brand /></div>\n      <AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="header" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} />\n    </header>\n    <main className="account-settings-main">\n      {view === "profile" ? <ProfileSettingsView client={db!} identity={identity} onIdentityPatch={patchIdentity} notify={setToast} /> : <PreferencesSettingsView client={db!} identity={identity} experience={experience} onIdentityPatch={patchIdentity} notify={setToast} />}\n    </main>\n    {toast ? <div className="toast">{toast}</div> : null}\n  </div>;\n  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} client={db!} email={accountEmail} onIdentityPatch={patchIdentity} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} />;\n  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} client={db!} email={accountEmail} onIdentityPatch={patchIdentity} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} />;'''
replace_once(old_returns, new_returns, 'account standalone and student portal routes')
replace_once(
    '<AccountMenu client={db!} identity={identity} experience={experience} email={session.user.email ?? ""} variant="sidebar" onExperience={setExperience} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} notify={setToast} />',
    '<AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="sidebar" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} />',
    'sidebar account menu',
)
replace_once(
    '<AccountMenu client={db!} identity={identity} experience={experience} email={session.user.email ?? ""} variant="header" onExperience={setExperience} onIdentityPatch={(patch) => setIdentity((current) => current ? { ...current, ...patch } : current)} notify={setToast} />',
    '<AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="header" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} />',
    'header account menu',
)
app_path.write_text(text)

css = css_path.read_text()
marker = '/* Standalone account settings screens */'
if marker in css:
    raise SystemExit('settings shell CSS already present')
css += '''\n\n/* Standalone account settings screens */\n.account-settings-shell{min-height:100svh;background:var(--bg,#f8f7fb);color:var(--ink,#24212f)}\n.account-settings-head{position:sticky;z-index:120;top:0;display:grid;grid-template-columns:52px minmax(0,1fr) 52px;align-items:center;min-height:72px;padding:max(8px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));border-bottom:1px solid #e8e5ee;background:rgba(255,255,255,.96);backdrop-filter:blur(18px)}\n.account-settings-back{justify-self:start}.account-settings-brand{justify-self:center}.account-settings-head>div:last-child{justify-self:end}\n.account-settings-main{width:min(940px,100%);margin:0 auto;padding:24px max(18px,env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}\n@media(max-width:700px){.account-settings-head{grid-template-columns:46px minmax(0,1fr) 46px;min-height:64px}.account-settings-main{padding-top:18px}}\n'''
css_path.write_text(css)
