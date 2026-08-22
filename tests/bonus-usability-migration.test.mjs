import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const path="supabase/migrations/20260822152400_bonus_usability_01.sql";
const sql=fs.readFileSync(path,"utf8");
const compact=sql.replace(/\s+/g," ").toLowerCase();

test("migration is one canonical Bonus authoring artifact and never embeds Attendance migrations",()=>{
  assert.match(path,/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
  assert.doesNotMatch(sql,/20260821170000|20260821170500|20260821171000|class_attendance_real_history|attendance_m1_forward_fix|class_attendance_finalize_compat/i);
});

test("starts_at is backfilled from purchased_at and pause history is separate from status",()=>{
  assert.match(compact,/add column if not exists starts_at timestamptz/);
  assert.match(compact,/set starts_at = purchased_at where starts_at is null/);
  assert.match(compact,/create table if not exists public\.credit_grant_pause_periods/);
  assert.doesNotMatch(compact,/status\s*=\s*'paused'/);
});

test("effective expiry cannot be resurrected by a pause that starts after effective expiry",()=>{
  const start=compact.indexOf("create or replace function private.credit_grant_effective_expires_at_unchecked");
  const end=compact.indexOf("create or replace function private.credit_grant_is_usable_unchecked",start);
  const fn=compact.slice(start,end);
  assert.match(fn,/language plpgsql/);
  assert.match(fn,/if v_pause\.paused_at >= v_expiry then continue/);
  assert.match(fn,/v_expiry := v_expiry \+ \(v_pause_end - v_pause\.paused_at\)/);
});

test("canonical usable predicate is server-side and includes paid|pending start pause expiry and ledger balance",()=>{
  const start=compact.indexOf("create or replace function private.credit_grant_is_usable_unchecked");
  const end=compact.indexOf("create or replace function private.person_has_usable_presential_bonus_unchecked",start);
  const fn=compact.slice(start,end);
  for (const token of ["g.status = 'active'","g.payment_status in ('paid','pending')","g.starts_at <= p_at","credit_grant_is_paused_unchecked","credit_grant_effective_expires_at_unchecked","credit_grant_balance_minutes_unchecked(g.id) > 0"]) assert.ok(fn.includes(token),token);
  assert.match(compact,/select coalesce\(sum\(m\.delta_minutes\), 0\)::integer from public\.credit_movements m where m\.grant_id = p_grant_id/);
});

test("DP-14 intent omits starts_at and pause gates but rejects terminal/expired/zero through operational criteria",()=>{
  const start=compact.indexOf("create or replace function private.person_has_qualifying_presential_billing_intent_unchecked");
  const end=compact.indexOf("revoke all on function private.billing_is_admin",start);
  const fn=compact.slice(start,end);
  assert.match(fn,/g.status = 'active'/);
  assert.match(fn,/g.payment_status in \('paid','pending'\)/);
  assert.match(fn,/credit_grant_balance_minutes_unchecked\(g.id\) > 0/);
  assert.match(fn,/credit_grant_effective_expires_at_unchecked/);
  assert.doesNotMatch(fn,/g\.starts_at\s*<=/);
  assert.doesNotMatch(fn,/credit_grant_is_paused_unchecked/);
});

test("corrections are append-only, preserve original movement/class source and audit before/after",()=>{
  const start=compact.indexOf("create or replace function public.correct_credit_consumption");
  const end=compact.indexOf("-- compatibility endpoint",start);
  const fn=compact.slice(start,end);
  assert.match(fn,/insert into public\.credit_movements/);
  assert.match(fn,/reverses_movement_id/);
  assert.match(fn,/v_original\.class_id/);
  assert.doesNotMatch(fn,/delete from public\.credit_movements/);
  assert.doesNotMatch(fn,/update public\.credit_movements/);
  assert.match(fn,/'before'/);
  assert.match(fn,/'after'/);
});

test("capacity edit appends its delta and never couples total_minutes to price",()=>{
  const start=compact.indexOf("create or replace function public.edit_credit_grant");
  const end=compact.indexOf("create or replace function public.pause_credit_grant",start);
  const fn=compact.slice(start,end);
  assert.match(fn,/v_consumed := greatest\(v_grant\.total_minutes - v_balance_without_refunds, 0\)/);
  assert.match(fn,/if p_total_minutes < v_consumed/);
  assert.match(fn,/v_capacity_delta := p_total_minutes - v_grant\.total_minutes/);
  assert.match(fn,/insert into public\.credit_movements/);
  assert.match(fn,/total_minutes=p_total_minutes/);
  assert.match(fn,/price_cents=p_price_cents/);
  assert.doesNotMatch(fn,/price.*\/.*total_minutes|total_minutes.*\/.*price/);
});

test("historical path is admin-gated audited and does not fabricate class attendance or payment facts",()=>{
  const start=compact.indexOf("create or replace function public.import_historical_credit_grant");
  const end=compact.indexOf("-- 8. append-only correction contract",start);
  const fn=compact.slice(start,end);
  assert.match(fn,/private.billing_is_admin/);
  assert.match(fn,/allow_historical_bonus_import/);
  assert.match(fn,/credit_grant_historical_imported/);
  assert.doesNotMatch(fn,/insert into public\.classes/);
  assert.doesNotMatch(fn,/insert into public\.class_participants/);
  assert.doesNotMatch(fn,/insert into public\.class_payment_movements/);
  assert.doesNotMatch(fn,/insert into public\.class_attendance_history/);
});

test("Billing stops lifecycle mutation without editing Personas rows",()=>{
  assert.match(compact,/drop trigger if exists credit_members_promote_crm_student on public\.credit_grant_members/);
  assert.doesNotMatch(compact,/update public\.people/);
  assert.doesNotMatch(compact,/update public\.student_profiles/);
  assert.doesNotMatch(compact,/alter table public\.people/);
  assert.doesNotMatch(compact,/alter table public\.student_profiles/);
});

test("migration does not alter Classes or Attendance schema/functions",()=>{
  assert.doesNotMatch(compact,/alter table public\.classes/);
  assert.doesNotMatch(compact,/alter table public\.class_participants/);
  assert.doesNotMatch(compact,/create or replace function public\.administratively_finish_class/);
  assert.doesNotMatch(compact,/create or replace function private\.record_class_attendance_fact/);
});

test("student/anonymous cannot mutate through new RPCs and admin-only historical gate is explicit",()=>{
  for (const fn of ["edit_credit_grant","pause_credit_grant","resume_credit_grant","refund_credit_grant_total","correct_credit_consumption"]) {
    assert.match(compact,new RegExp(`create or replace function public\\.${fn}`));
  }
  assert.match(compact,/if not \(select private\.is_staff\(\)\) then/);
  assert.match(compact,/if not \(select private\.billing_is_admin\(\)\) then/);
  assert.match(compact,/revoke all on function public\.refund_credit_grant_total\(bigint,text\) from public, anon/);
});

test("administrative mutations emit durable audit events with before/after where state changes",()=>{
  for (const event of ["credit_grant_edited","credit_grant_paused","credit_grant_resumed","credit_grant_refunded_total","billing_historical_import_gate_changed","credit_grant_historical_imported","credit_consumption_corrected"]) assert.ok(compact.includes(`'${event}'`),event);
  assert.ok((compact.match(/'before'/g)||[]).length>=6);
  assert.ok((compact.match(/'after'/g)||[]).length>=6);
});
