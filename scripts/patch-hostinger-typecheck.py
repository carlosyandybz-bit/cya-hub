from pathlib import Path

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

old = '''  if (!identity) return <main className="login"><section className="login-card"><Brand /><h1>Acceso no disponible</h1><p>La cuenta existe, pero no tiene un rol activo en CYA Hub.</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  async function setExperience(value: ExperienceContext) {
    const allowed = value === "teacher" ? identity.can_teach : value === "student" ? identity.can_study : identity.can_admin;
    if (!allowed || !db) return;
    setExperienceState(value);
    if (value === "admin") setView("admin");
    else if (value === "teacher" && view === "admin") setView("home");
    const result = await db.from("user_preferences").upsert({ user_id: identity.user_id, preferred_context: value }, { onConflict: "user_id" });
'''
new = '''  if (!identity) return <main className="login"><section className="login-card"><Brand /><h1>Acceso no disponible</h1><p>La cuenta existe, pero no tiene un rol activo en CYA Hub.</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  const activeIdentity = identity;
  async function setExperience(value: ExperienceContext) {
    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;
    if (!allowed || !db) return;
    setExperienceState(value);
    if (value === "admin") setView("admin");
    else if (value === "teacher" && view === "admin") setView("home");
    const result = await db.from("user_preferences").upsert({ user_id: activeIdentity.user_id, preferred_context: value }, { onConflict: "user_id" });
'''

if old not in text:
    raise SystemExit("Identity narrowing target not found")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
