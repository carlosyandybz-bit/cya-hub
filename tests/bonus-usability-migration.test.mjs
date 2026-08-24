import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const path="supabase/migrations/20260822152400_bonus_usability_01.sql";
const sql=fs.readFileSync(path,"utf8");
const compact=sql.replace(/\s+/g," ").toLowerCase();

function functionBody(name,nextName){
  const start=compact.indexOf(`create or replace function ${name}`);
  assert.notEqual(start,-1,`${name} missing`);
  const end=nextName ? compact.indexOf(`create or replace function ${nextName}`,start) : compact.length;
  assert.notEqual(end,-1,`${nextName} missing`);
  return compact.slice(start,end);
}

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
  const fn=functionBody("private.credit_grant_effective_expires_at_unchecked","private.credit_grant_is_usable_unchecked");
  assert.match(fn,/language plpgsql/);
  assert.match(fn,/if v_pause\.paused_at >= v_expiry then continue/);
  assert.match(fn,/v_expiry := v_expiry \+ \(v_pause_end - v_pause\.paused_at\)/);
});

test("canonical usable predicate is server-side and includes paid|pending start pause expiry and ledger balance",()=>{
  const fn=functionBody("private.credit_grant_is_usable_unchecked","private.person_has_usable_presential_bonus_unchecked");
  for (const token of ["g.status = 'active'","g.payment_status in ('paid','pending')","g.starts_at <= p_at","credit_grant_is_paused_unchecked","credit_grant_effective_expires_at_unchecked","credit_grant_balance_minutes_unchecked(g.id) > 0"]) assert.ok(fn.includes(token),token);
  assert.match(compact,/select coalesce\(sum\(m\.delta_minutes\), 0\)::integer from public\.credit_movements m where m\.grant_id = p_grant_id/);
});

test("DP-14 intent omits starts_at and pause gates but rejects terminal/expired/zero through operational criteria",()=>{
  const fn=functionBody("private.person_has_qualifying_presential_billing_intent_unchecked","private.aud017_notify_student_credit_balance");
  assert.match(fn,/g.status = 'active'/);
  assert.match(fn,/g.payment_status in \('paid','pending'\)/);
  assert.match(fn,/credit_grant_balance_minutes_unchecked\(g.id\) > 0/);
  assert.match(fn,/credit_grant_effective_expires_at_unchecked/);
  assert.doesNotMatch(fn,/g\.starts_at\s*<=/);
  assert.doesNotMatch(fn,/credit_grant_is_paused_unchecked/);
});

test("corrections are append-only, preserve original movement/class source and audit before/after",()=>{
  const fn=functionBody("public.correct_credit_consumption","public.set_credit_grant_consumed_minutes");
  assert.match(fn,/insert into public\.credit_movements/);
  assert.match(fn,/reverses_movement_id/);
  assert.match(fn,/v_original\.class_id/);
  assert.doesNotMatch(fn,/delete from public\.credit_movements/);
  assert.doesNotMatch(fn,/update public\.credit_movements/);
  assert.match(fn,/'before'/);
  assert.match(fn,/'after'/);
});

test("capacity edit appends its delta and never couples total_minutes to price",()=>{
  const fn=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  assert.match(fn,/v_consumed := greatest\(v_grant\.total_minutes - v_balance_without_refunds, 0\)/);
  assert.match(fn,/if p_total_minutes < v_consumed/);
  assert.match(fn,/v_capacity_delta := p_total_minutes - v_grant\.total_minutes/);
  assert.match(fn,/insert into public\.credit_movements/);
  assert.match(fn,/total_minutes=p_total_minutes/);
  assert.match(fn,/price_cents=p_price_cents/);
  assert.doesNotMatch(fn,/price.*\/.*total_minutes|total_minutes.*\/.*price/);
});

test("BONUS-REFUND-TERMINAL-01 locks the grant then denies every terminal edit with SQLSTATE 22023 before side effects",()=>{
  const fn=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  const lock=fn.indexOf("for update");
  const notFound=fn.indexOf("if not found",lock);
  const guard=fn.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'",notFound);
  const err=fn.indexOf("errcode='22023'",guard);
  const before=fn.indexOf("v_before :=",guard);
  const movement=fn.indexOf("insert into public.credit_movements",guard);
  const update=fn.indexOf("update public.credit_grants",guard);
  const audit=fn.indexOf("insert into public.audit_events",guard);
  assert.ok(lock>=0 && notFound>lock && guard>notFound,"terminal guard must follow row lock/existence check");
  assert.ok(err>guard,"terminal guard must raise SQLSTATE 22023");
  assert.ok(before>err && movement>err && update>err && audit>err,"terminal guard must precede every economic/update/audit side effect");
});

test("refund then capacity/price/date edit is fail-closed through one unconditional terminal gate",()=>{
  const edit=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  const guard=edit.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'");
  for (const protectedToken of [
    "v_capacity_delta := p_total_minutes - v_grant.total_minutes",
    "price_cents=p_price_cents",
    "purchased_at=p_purchased_at",
    "starts_at=p_starts_at",
    "expires_at=p_expires_at",
  ]) {
    const pos=edit.indexOf(protectedToken);
    assert.ok(pos>guard,`${protectedToken} must remain behind terminal guard`);
  }
});

test("total refund neutralizes balance, records the refund audit, and seals status/payment terminally",()=>{
  const refund=functionBody("public.refund_credit_grant_total","public.set_billing_historical_import_enabled");
  assert.match(refund,/if v_balance > 0 then insert into public\.credit_movements/);
  assert.match(refund,/p_grant_id,'refund',-v_balance/);
  assert.match(refund,/set payment_status='refunded',status='cancelled'/);
  assert.match(refund,/'credit_grant_refunded_total'/);
  assert.match(refund,/'before'/);
  assert.match(refund,/'after'/);
});

test("repeated total refund is idempotent and cannot create a second refund movement",()=>{
  const refund=functionBody("public.refund_credit_grant_total","public.set_billing_historical_import_enabled");
  const already=refund.indexOf("if v_grant.payment_status='refunded' then");
  const earlyReturn=refund.indexOf("return jsonb_build_object",already);
  const balance=refund.indexOf("v_balance :=",already);
  const movement=refund.indexOf("insert into public.credit_movements",already);
  assert.ok(already>=0 && earlyReturn>already && balance>earlyReturn && movement>earlyReturn);
  assert.match(refund.slice(already,balance),/'already_refunded',true,'balance_minutes',private\.credit_grant_balance_minutes_unchecked/);
});

test("refunded/cancelled grants remain unusable and do not qualify DP-14 presencial intent",()=>{
  const usable=functionBody("private.credit_grant_is_usable_unchecked","private.person_has_usable_presential_bonus_unchecked");
  const intent=functionBody("private.person_has_qualifying_presential_billing_intent_unchecked","private.aud017_notify_student_credit_balance");
  assert.match(usable,/g.status = 'active'/);
  assert.match(usable,/g.payment_status in \('paid','pending'\)/);
  assert.match(intent,/g.status = 'active'/);
  assert.match(intent,/g.payment_status in \('paid','pending'\)/);
});

test("normal pre-refund capacity edits still generate the exact ledger adjustment and audited update",()=>{
  const edit=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  const guardEnd=edit.indexOf("end if",edit.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'"));
  const capacity=edit.indexOf("v_capacity_delta := p_total_minutes - v_grant.total_minutes",guardEnd);
  const movement=edit.indexOf("'adjustment',v_capacity_delta",capacity);
  const update=edit.indexOf("update public.credit_grants",movement);
  const audit=edit.indexOf("'credit_grant_edited'",update);
  assert.ok(capacity>guardEnd && movement>capacity && update>movement && audit>update);
});

test("failed terminal edit has no partial movement, grant update, or edit audit path before the exception",()=>{
  const edit=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  const guard=edit.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'");
  const err=edit.indexOf("errcode='22023'",guard);
  const prefix=edit.slice(0,err);
  assert.doesNotMatch(prefix,/insert into public\.credit_movements/);
  assert.doesNotMatch(prefix,/update public\.credit_grants/);
  assert.doesNotMatch(prefix,/'credit_grant_edited'/);
});

test("BONUS-REFUND-TERMINAL-02 locks original movement and grant then denies correction with SQLSTATE 22023 before every correction side effect",()=>{
  const fn=functionBody("public.correct_credit_consumption","public.set_credit_grant_consumed_minutes");
  const originalLock=fn.indexOf("where id=p_original_movement_id for update");
  const originalExists=fn.indexOf("if not found",originalLock);
  const grantLock=fn.indexOf("where id=v_original.grant_id for update",originalExists);
  const grantExists=fn.indexOf("if not found",grantLock);
  const guard=fn.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'",grantExists);
  const err=fn.indexOf("errcode='22023'",guard);
  const correctionSum=fn.indexOf("into v_correction_sum",guard);
  const movement=fn.indexOf("insert into public.credit_movements",guard);
  const update=fn.indexOf("update public.credit_grants",guard);
  const audit=fn.indexOf("insert into public.audit_events",guard);
  assert.ok(originalLock>=0 && originalExists>originalLock,"original movement must be locked and existence-checked first");
  assert.ok(grantLock>originalExists && grantExists>grantLock,"grant must be locked and existence-checked before terminal guard");
  assert.ok(guard>grantExists && err>guard,"terminal correction guard must raise SQLSTATE 22023 after both locks");
  assert.ok(correctionSum>err && movement>err && update>err && audit>err,"terminal guard must precede correction sum, movement, grant update and audit");
});

test("refund then correction to 45, 75, zero, or any later replacement is unconditionally fail-closed before target-specific calculation",()=>{
  const fn=functionBody("public.correct_credit_consumption","public.set_credit_grant_consumed_minutes");
  const guard=fn.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'");
  const capacityCheck=fn.indexOf("if p_replacement_consumed_minutes > v_grant.total_minutes",guard);
  const sum=fn.indexOf("into v_correction_sum",guard);
  const target=fn.indexOf("v_target_delta := -p_replacement_consumed_minutes",guard);
  const balance=fn.indexOf("v_balance_before :=",guard);
  assert.ok(guard>=0 && capacityCheck>guard && sum>guard && target>guard && balance>guard);
  assert.doesNotMatch(fn.slice(0,guard),/v_target_delta\s*:=|into v_correction_sum|insert into public\.credit_movements|'credit_consumption_corrected'/);
});

test("pre-refund corrections still support lower, higher, successive targets while preserving origin and preventing negative balance",()=>{
  const fn=functionBody("public.correct_credit_consumption","public.set_credit_grant_consumed_minutes");
  assert.match(fn,/where m\.reverses_movement_id=v_original\.id/);
  assert.match(fn,/v_current_effective_delta := v_original\.delta_minutes \+ v_correction_sum/);
  assert.match(fn,/v_target_delta := -p_replacement_consumed_minutes/);
  assert.match(fn,/v_delta := v_target_delta - v_current_effective_delta/);
  assert.match(fn,/if v_balance_after < 0 then/);
  for (const token of ["v_original.person_id","v_original.class_id","v_original.id","'original_provenance',v_original.provenance"]) assert.ok(fn.includes(token),token);
  assert.match(fn,/reverses_movement_id,provenance/);
  assert.doesNotMatch(fn,/delete from public\.credit_movements/);
  assert.doesNotMatch(fn,/update public\.credit_movements/);
});

test("terminal write-surface sweep seals edit, manual target, pause and resume while total refund remains idempotent",()=>{
  const edit=functionBody("public.edit_credit_grant","public.pause_credit_grant");
  const pause=functionBody("public.pause_credit_grant","public.resume_credit_grant");
  const resume=functionBody("public.resume_credit_grant","public.refund_credit_grant_total");
  const refund=functionBody("public.refund_credit_grant_total","public.set_billing_historical_import_enabled");
  const correction=functionBody("public.correct_credit_consumption","public.set_credit_grant_consumed_minutes");
  const manual=functionBody("public.set_credit_grant_consumed_minutes",null);

  assert.match(edit,/if v_grant\.status='cancelled' or v_grant\.payment_status='refunded'/);
  assert.match(pause,/if v_grant\.status <> 'active' or v_grant\.payment_status not in \('paid','pending'\)/);
  assert.match(resume,/if v_grant\.status='cancelled' or v_grant\.payment_status='refunded'/);
  assert.match(correction,/if v_grant\.status='cancelled' or v_grant\.payment_status='refunded'/);
  assert.match(manual,/if v_grant\.status='cancelled' or v_grant\.payment_status='refunded'/);
  assert.match(refund,/if v_grant\.payment_status='refunded' then return jsonb_build_object/);

  const resumeGuard=resume.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'");
  assert.ok(resume.indexOf("update public.credit_grant_pause_periods",resumeGuard)>resumeGuard);
  assert.ok(resume.indexOf("'credit_grant_resumed'",resumeGuard)>resumeGuard);

  const manualGuard=manual.indexOf("if v_grant.status='cancelled' or v_grant.payment_status='refunded'");
  assert.ok(manual.indexOf("insert into public.credit_movements",manualGuard)>manualGuard);
  assert.ok(manual.indexOf("update public.credit_grants",manualGuard)>manualGuard);
});

test("historical path is admin-gated audited and does not fabricate class attendance or payment facts",()=>{
  const fn=functionBody("public.import_historical_credit_grant","public.correct_credit_consumption");
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
