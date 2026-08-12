import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const home=fs.readFileSync('app/home-view.tsx','utf8');
const domain=fs.readFileSync('app/p24-home-domain.ts','utf8');
const admin=fs.readFileSync('app/admin-daily-quotes.tsx','utf8');
const migration=fs.readFileSync('db/migrations/v58_p24_contextual_home.sql','utf8');

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
  const rotation=migration.indexOf("v_recent_limit := greatest(v_base_count-1,0)");
  assert.ok(exact>=0&&recurring>exact&&rotation>recurring);
  assert.match(migration,/order by a\.local_date desc\s+limit v_recent_limit/);
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

test('P24 migration keeps RPCs invoker-side and anon revoked',()=>{
  assert.match(migration,/security invoker/g);
  assert.match(migration,/revoke all on function public\.home_snapshot\(\) from anon/);
  assert.match(migration,/revoke all on function public\.preview_daily_quote\(date\) from anon/);
  assert.doesNotMatch(migration,/security definer/i);
});
