import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const home=fs.readFileSync('app/home-view.tsx','utf8');
const domain=fs.readFileSync('app/p24-home-domain.ts','utf8');
const admin=fs.readFileSync('app/admin-daily-quotes.tsx','utf8');
const migration=fs.readFileSync('db/migrations/v58_p24_contextual_home.sql','utf8');
const hardening=fs.readFileSync('db/migrations/v59_p24_quote_preview_privileges.sql','utf8');
const qaBootstrap=fs.readFileSync('supabase/functions/cya-qa-bootstrap/index.ts','utf8');

test('P24 keeps a live clock and reloads on local day change',()=>{
  assert.match(home,/setInterval\(\(\) => setNow\(Date\.now\(\)\), 15_000\)/);
  assert.match(home,/\[load, dayKey\]/);
  assert.match(home,/greetingForTimestamp\(now, timezone/);
});

test('P24 class priority is active then scheduled within 30 minutes before missions',()=>{
  const active=domain.indexOf('if (active) return { kind: "class"');
  const within=domain.indexOf('if (within30) return { kind: "class"');
  const mission=domain.indexOf('return mission ? { kind: "mission"');
  assert.ok(active>=0&&within>active&&mission>within);
  assert.match(domain,/distance >= -30 \* 60_000 && distance <= 30 \* 60_000/);
  assert.doesNotMatch(domain,/status === "finished"/);
});

test('P24 daily quote assignment is one row per user and date with immutable text snapshot',()=>{
  assert.match(migration,/primary key \(user_id, local_date\)/);
  assert.match(migration,/quote_text_snapshot text not null/);
  assert.match(migration,/on conflict \(user_id,local_date\) do nothing/);
  assert.match(migration,/select a\.quote_id, a\.quote_text_snapshot, a\.selection_kind/);
});

test('P24 quote selection prioritizes date then recurring then rotation with recent-history avoidance',()=>{
  const exact=migration.indexOf("q.override_date=v_day");
  const recurring=migration.indexOf("q.month_day=to_char(v_day,'MM-DD')");
  const rotation=migration.indexOf("v_recent_limit := greatest(v_rotation_count-1,0)");
  assert.ok(exact>=0&&recurring>exact&&rotation>recurring);
  assert.match(migration,/order by a\.local_date desc\s+limit v_recent_limit/);
});

test('P24 rotation fallback can use existing recurring catalogue outside its scheduled date',()=>{
  assert.match(migration,/select count\(\*\)::integer into v_rotation_count\s+from public\.daily_quotes q\s+where q\.active and q\.override_date is null/);
  assert.match(migration,/select q\.id, q\.quote_text, 'rotation'[\s\S]*?from public\.daily_quotes q\s+where q\.active and q\.override_date is null\s+order by/);
  assert.doesNotMatch(migration,/where q\.active and q\.override_date is null and q\.month_day is null/);
});

test('P24 does not allow deleting a quote with assignment history',()=>{
  assert.match(migration,/quote_id bigint not null references public\.daily_quotes\(id\) on delete restrict/);
  assert.match(admin,/Esta frase ya tiene historial diario\. Desactívala en lugar de borrarla/);
  assert.match(admin,/disabled=\{used\.has\(quote\.id\)\|\|busy\}/);
});

test('P24 admin supports preview, activation and CSV conflict preview',()=>{
  assert.match(admin,/preview_daily_quote/);
  assert.match(admin,/Importar CSV/);
  assert.match(admin,/date_conflict/);
  assert.match(admin,/recurring_conflict/);
  assert.match(admin,/Texto duplicado/);
  assert.match(admin,/update\(\{active:!quote\.active\}\)/);
});

test('P24 Home consumes canonical calendar snapshot and removes dominant duplicates',()=>{
  assert.match(home,/client\.rpc\("calendar_snapshot"/);
  assert.match(home,/mission\.id !== focusMission\?\.id/);
  assert.match(home,/item\.id === focusClass\.id/);
  assert.match(home,/Acciones rápidas/);
});

test('P24 RPCs stay invoker-side and preview execution is removed from PUBLIC and anon',()=>{
  assert.match(migration,/security invoker/g);
  assert.match(migration,/revoke all on function public\.home_snapshot\(\) from anon/);
  assert.match(hardening,/revoke all on function public\.preview_daily_quote\(date\) from public/);
  assert.match(hardening,/revoke all on function public\.preview_daily_quote\(date\) from anon/);
  assert.match(hardening,/grant execute on function public\.preview_daily_quote\(date\) to authenticated/);
  assert.doesNotMatch(migration,/security definer/i);
});

test('QA bootstrap accepts the public repository only for the pinned owner actor and workflow',()=>{
  assert.match(qaBootstrap,/const EXPECTED_REPOSITORY_ID = "1328286685"/);
  assert.match(qaBootstrap,/const EXPECTED_ACTOR = "carlosyandybz-bit"/);
  assert.match(qaBootstrap,/const EXPECTED_ACTOR_ID = "306267740"/);
  assert.match(qaBootstrap,/\["private", "public"\]\.includes\(claims\.repository_visibility \?\? ""\)/);
  assert.match(qaBootstrap,/claims\.actor !== EXPECTED_ACTOR \|\| claims\.actor_id !== EXPECTED_ACTOR_ID/);
  assert.match(qaBootstrap,/EXPECTED_WORKFLOW_PREFIX/);
  assert.doesNotMatch(qaBootstrap,/repository_visibility !== "private"/);
});
