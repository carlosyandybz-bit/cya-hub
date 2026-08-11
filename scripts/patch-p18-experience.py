from pathlib import Path

app_path=Path('app/cya-app.tsx')
app=app_path.read_text()
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
  }
'''
if 'db.rpc("set_experience_context"' not in app:
    start=app.index('  async function setExperience(value: ExperienceContext) {')
    end=app.index('  const accountEmail =',start)
    app=app[:start]+replacement+app[end:]
app_path.write_text(app)

menu_path=Path('app/account-menu.tsx')
menu=menu_path.read_text()
replacements={
  '<span className={styles.rowText}><strong>Cambiar de portal</strong><small>{contextLabels[experience]}</small></span>':'<span className={styles.rowText}><strong>Ver como</strong><small>{contextLabels[experience]}</small></span>',
  '<div><span>Portal activo</span><strong>{contextLabels[experience]}</strong></div>':'<div><span>Vista activa</span><strong>{contextLabels[experience]}</strong></div>',
  '<p className={styles.accountNote}>Tus permisos se mantienen al cambiar de portal.</p>':'<p className={styles.accountNote}>Cambiar de vista no cambia tus permisos reales.</p>',
  'const [avatarFailed, setAvatarFailed] = useState(false);':'const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);',
  '  useEffect(() => setAvatarFailed(false), [identity.avatar_url]);\n\n':'',
  'const showAvatarImage = Boolean(identity.avatar_url && !avatarFailed);':'const showAvatarImage = Boolean(identity.avatar_url && identity.avatar_url !== failedAvatarUrl);',
  'onError={() => setAvatarFailed(true)}':'onError={() => setFailedAvatarUrl(identity.avatar_url)}',
}
for old,new in replacements.items():
    if old in menu:
        menu=menu.replace(old,new,1)
    elif new not in menu:
        raise SystemExit(f'account menu anchor not found: {old[:50]}')
menu_path.write_text(menu)
