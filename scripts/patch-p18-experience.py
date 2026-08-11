from pathlib import Path
import re

app_path=Path('app/cya-app.tsx')
app=app_path.read_text()

pattern=re.compile(r'''  async function setExperience\(value: ExperienceContext\) \{\n    const allowed = value === \\"teacher\\" \? activeIdentity\.can_teach : value === \\"student\\" \? activeIdentity\.can_study : activeIdentity\.can_admin;\n    if \(!allowed \|\| !db\) return;\n    if \(value === \\"admin\\"\) navigateView\(\\"admin\\", \{ experience: value \}\);\n    else if \(value === \\"teacher\\" && view === \\"admin\\"\) navigateView\(\\"home\\", \{ experience: value \}\);\n    else \{\n      window\.history\.pushState\(historyState\(view, \{ experience: value \}\), \\"\\", window\.location\.href\);\n      setExperienceState\(value\);\n    \}\n    const result = await db\.from\(\\"user_preferences\\"\)\.upsert\(\{ user_id: activeIdentity\.user_id, preferred_context: value \}, \{ onConflict: \\"user_id\\" \}\);\n    if \(result\.error\) setToast\(\\"La vista ha cambiado, pero no se pudo guardar como preferencia\.\\"\);\n  \}''')
replacement='''  async function setExperience(value: ExperienceContext) {
    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;
    if (!allowed || !db) return;
    const result = await db.rpc("set_experience_context", { p_context: value });
    if (result.error) {
      setToast(result.error.message || "No se pudo cambiar de vista.");
      return;
    }
    if (result.data) setIdentity(result.data as IdentityContext);
    if (value === "admin") navigateView("admin", { experience: value });
    else if (value === "teacher" && view === "admin") navigateView("home", { experience: value });
    else {
      window.history.pushState(historyState(view, { experience: value }), "", window.location.href);
      setExperienceState(value);
    }
  }'''
app2,count=pattern.subn(replacement,app,count=1)
if count!=1:
    if 'db.rpc("set_experience_context"' not in app:
        raise SystemExit(f'setExperience replacement failed: {count}')
    app2=app
app_path.write_text(app2)

menu_path=Path('app/account-menu.tsx')
menu=menu_path.read_text()
replacements={
  '<span className={styles.rowText}><strong>Cambiar de portal</strong><small>{contextLabels[experience]}</small></span>':'<span className={styles.rowText}><strong>Ver como</strong><small>{contextLabels[experience]}</small></span>',
  '<div><span>Portal activo</span><strong>{contextLabels[experience]}</strong></div>':'<div><span>Vista activa</span><strong>{contextLabels[experience]}</strong></div>',
  '<p className={styles.accountNote}>Tus permisos se mantienen al cambiar de portal.</p>':'<p className={styles.accountNote}>Cambiar de vista no cambia tus permisos reales.</p>',
}
for old,new in replacements.items():
    if old in menu:
        menu=menu.replace(old,new,1)
    elif new not in menu:
        raise SystemExit(f'account menu anchor not found: {old[:40]}')
menu_path.write_text(menu)
