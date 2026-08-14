import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const menu=fs.readFileSync('app/account-menu.tsx','utf8');
const switcher=fs.readFileSync('app/experience-switcher.tsx','utf8');
const router=fs.readFileSync('app/app-entry-router.tsx','utf8');
const css=fs.readFileSync('app/globals.css','utf8');
const sql=fs.readFileSync('supabase/v46_p18_experience_context.sql','utf8');

test('P18 keeps the definitive five-destination navigation',()=>{
  for(const pair of [['home','Inicio'],['students','Alumnado'],['live','Dar clase'],['teaching','Enseñanza'],['marketing','Marketing']]) {
    assert.match(app,new RegExp(`\\[\\"${pair[0]}\\", \\"${pair[1]}\\"`));
  }
  assert.match(css,/\.mobile-nav \{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s);
  assert.match(css,/\.mobile-nav button\.primary \{[^}]*translateY\(-11px\)/s);
});

test('Ver como is role-derived, explicit and hidden when there is no real choice',()=>{
  assert.match(menu,/ExperienceSwitcher/);
  assert.match(switcher,/>Ver como</);
  assert.match(switcher,/if \(identity\.can_teach\) values\.push\("teacher"\)/);
  assert.match(switcher,/if \(identity\.can_study\) values\.push\("student"\)/);
  assert.match(switcher,/if \(identity\.can_admin\) values\.push\("admin"\)/);
  assert.match(switcher,/if \(contexts\.length <= 1\) return null/);
  assert.match(switcher,/aria-pressed=\{active\}/);
  assert.match(switcher,/Cambiar de vista no cambia tus permisos reales/);
  assert.match(app,/experience === "student" && identity\.can_study/);
  assert.match(app,/view === "admin" && db && identity\.can_admin/);
});

test('changing experience is authorized and persisted by the server RPC before UI navigation',()=>{
  assert.match(app,/db\.rpc\("set_experience_context", \{ p_context: value \}\)/);
  assert.doesNotMatch(app,/db\.from\("user_preferences"\)\.upsert\(\{ user_id: activeIdentity\.user_id, preferred_context: value \}/);
  assert.match(app,/if \(result\.error\) \{[\s\S]*return;[\s\S]*if \(value === "admin"\)/);
  assert.match(sql,/v_context not in \('teacher','student','admin'\)/);
  assert.match(sql,/v_context='teacher' and not \(select private\.is_staff\(\)\)/);
  assert.match(sql,/v_context='student' and not \(select private\.has_app_role\('student'\)\)/);
  assert.match(sql,/v_context='admin' and not \(select private\.is_admin\(\)\)/);
});

test('PR-F2 treats UI events as wake-ups, never as permission grants',()=>{
  assert.match(router,/function allowed\(identity: IdentityContext, value: ExperienceContext\)/);
  assert.match(router,/if \(!allowed\(studentState\.identity, value\)\) throw new Error\("No tienes acceso a esa vista\."\)/);
  assert.match(router,/client\.rpc\("identity_context"\)/);
  assert.match(router,/client\.rpc\("set_experience_context", \{ p_context: value \}\)/);
  assert.match(router,/if \(!allowed\(identity, value\)\) throw new Error\("No tienes acceso a esa vista\."\)/);
  assert.match(router,/addEventListener\("cya:experience-change", onCanonicalContextChange\)/);
  assert.doesNotMatch(router,/event\.detail/);
  assert.doesNotMatch(router,/setInterval/);
});

test('P18 preserves real browser history for view and experience changes',()=>{
  assert.match(app,/window\.history\.pushState\(state, "", window\.location\.href\)/);
  assert.match(app,/window\.addEventListener\("popstate"/);
  assert.match(app,/window\.history\.pushState\(historyState\(view, \{ experience: value \}\)/);
});

test('experience RPC is authenticated-only and cannot manufacture a role',()=>{
  assert.match(sql,/security definer/i);
  assert.match(sql,/revoke all on function public\.set_experience_context\(text\) from public, anon/);
  assert.match(sql,/grant execute on function public\.set_experience_context\(text\) to authenticated/);
  assert.doesNotMatch(sql,/insert into public\.app_member_roles/i);
  assert.doesNotMatch(sql,/update public\.app_member_roles/i);
});
