import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const v76=readFileSync("db/migrations/v76_bz_points_rewards.sql","utf8");
const v77=readFileSync("db/migrations/v77_bz_trigger_acl_hardening.sql","utf8");
const v78=readFileSync("db/migrations/v78_bz_trigger_rowtype_fix.sql","utf8");
const v79=readFileSync("db/migrations/v79_bz_backup_reset_integration.sql","utf8");
const student=readFileSync("app/bz-points-panel.tsx","utf8");
const studentCss=readFileSync("app/bz-points-panel.module.css","utf8");
const admin=readFileSync("app/bz-points-admin.tsx","utf8");
const app=readFileSync("app/cya-app.tsx","utf8");
const adminView=readFileSync("app/admin-view.tsx","utf8");
const transfer=readFileSync("app/admin-data-transfer.tsx","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");
const engine=readFileSync("app/statistics-engine.ts","utf8");

test("BZ uses an auditable ledger separate from pedagogical evaluation points",()=>{
  for(const table of ["bz_point_rules","bz_point_ledger","bz_action_events","bz_rewards","bz_reward_redemptions"]) assert.match(v76,new RegExp(`create table if not exists public\\.${table}`),table);
  assert.match(v76,/idempotency_key text not null unique/);
  assert.match(v76,/points_delta integer not null check \(points_delta <> 0/);
  assert.doesNotMatch(v76,/evaluation_progress_awards|teaching_content_evaluation_points/);
  assert.match(v76,/create or replace view public\.bz_person_statistics with \(security_invoker=true\)/);
});

test("all seven requested earning rules are server configured and launch-gated",()=>{
  for(const key of ["registration","daily_login","bonus_purchase","class_attended","exercise_completed","previous_class_review","next_class_content_choice"]) assert.match(v76,new RegExp(`'${key}'`),key);
  assert.match(v76,/active_from timestamptz not null default now\(\)/);
  assert.match(v76,/coalesce\(p_event_at,now\(\)\) < v_rule\.active_from/);
  assert.match(v76,/v_rule\.points/);
});

test("automatic awards require canonical business facts and remain idempotent",()=>{
  assert.match(v76,/payment_status<>'paid' or v_grant\.price_cents<=0/);
  assert.match(v76,/v_class\.status<>'finished' or v_class\.administrative_finished_at is null/);
  assert.match(v76,/attendance_status='present'/);
  assert.match(v76,/content_type='exercise'/);
  assert.match(v76,/assignment_status='completed'/);
  assert.match(v76,/event_type='exercise_completed'/);
  assert.match(v76,/'bz:exercise:'\|\|p_person_id\|\|':'\|\|p_content_id/);
  assert.match(v76,/on conflict\(idempotency_key\) do nothing/);
});

test("student actions are server validated and cannot choose their award amount",()=>{
  assert.match(v76,/private\.bz_local_date\(\)/);
  assert.match(v76,/from public\.user_preferences/);
  assert.match(v76,/private\.bz_validate_next_class/);
  assert.match(v76,/Solo puedes preparar tu próxima clase/);
  assert.match(v76,/class_preparation_requests/);
  assert.match(v76,/'bz:review:'\|\|v_person\|\|':'\|\|v_date/);
  assert.match(v76,/'bz:content-choice:'\|\|v_person\|\|':'\|\|p_class_id/);
  assert.doesNotMatch(student,/\bp_points\s*:/);
  assert.doesNotMatch(student,/client\.rpc\([^\n]*points_delta/);
  assert.match(student,/points_delta: number/);
});

test("reward redemption is atomic and protected against overspending",()=>{
  assert.match(v76,/pg_advisory_xact_lock\(hashtextextended\('bz-person:'/);
  assert.match(v76,/if v_balance<v_reward\.cost_points/);
  assert.match(v76,/entry_type,points_delta[\s\S]*'redeem',-v_reward\.cost_points/);
  assert.match(v76,/coupon_code text not null unique/);
  assert.match(v76,/reward_type='discount_coupon'/);
});

test("BZ RLS and helper ACLs keep writes behind RPCs",()=>{
  assert.match(v76,/alter table public\.bz_point_ledger enable row level security/);
  assert.match(v76,/person_id=\(select private\.current_person_id\(\)\) or \(select private\.is_staff\(\)\)/);
  assert.match(v76,/revoke insert,update,delete on public\.bz_point_ledger from authenticated/);
  for(const name of ["bz_registration_trigger","bz_credit_grant_trigger","bz_class_trigger","bz_assignment_trigger","bz_class_content_event_trigger"]) assert.match(v77,new RegExp(`revoke all on function private\\.${name}\\(\\) from public,anon,authenticated`),name);
  assert.match(v78,/if tg_table_name='classes' then[\s\S]*new\.id[\s\S]*else[\s\S]*new\.class_id/);
  assert.match(v78,/if tg_table_name='credit_grants' then[\s\S]*new\.id[\s\S]*else[\s\S]*new\.grant_id/);
});

test("student portal exposes BZ progress, preparation, rewards and history",()=>{
  for(const rpc of ["bz_snapshot","bz_confirm_previous_class_review","bz_choose_next_class_content","bz_redeem_reward"]) assert.match(student,new RegExp(rpc),rpc);
  assert.match(student,/Tu progreso también suma/);
  assert.match(student,/He repasado la clase anterior/);
  assert.match(student,/¿Qué quieres trabajar\?/);
  assert.match(student,/MIS CUPONES/);
  assert.match(student,/Historial de BZ Points/);
  assert.match(studentCss,/@media\(max-width:720px\)/);
  assert.match(studentCss,/@media\(max-width:430px\)/);
  assert.match(app,/nextIdentity\?\.can_study\) void db\.rpc\("bz_record_daily_login"\)/);
  assert.match(app,/<BZPointsPanel client=\{client\} assignments=\{snapshot\.assignments\}/);
});

test("Administration edits rules and rewards through audited RPCs",()=>{
  for(const rpc of ["admin_bz_save_rule","admin_bz_save_reward","admin_bz_adjust_points"]) assert.match(admin,new RegExp(rpc),rpc);
  assert.match(admin,/bz_person_statistics/);
  assert.match(admin,/El saldo siempre se calcula desde movimientos auditables/);
  assert.match(adminView,/\["bz", "BZ Points", WalletCards\]/);
  assert.match(adminView,/section === "bz" \? bzSection\(\)/);
});

test("P28/P32 backup and reset understand BZ without deleting configuration",()=>{
  assert.match(v79,/if p_domain='bz' then/);
  for(const table of ["bz_point_rules","bz_rewards","bz_action_events","bz_point_ledger","bz_reward_redemptions"]) assert.match(v79,new RegExp(`'${table}'`),table);
  assert.match(v79,/p_domain='settings'[\s\S]*bz_point_rules[\s\S]*bz_rewards/);
  assert.match(v79,/p_domain='complete'[\s\S]*bz_point_ledger/);
  assert.match(v79,/p_scope in \('operational','full'\)[\s\S]*delete from public\.bz_reward_redemptions;[\s\S]*delete from public\.bz_point_ledger;[\s\S]*delete from public\.bz_action_events;/);
  assert.doesNotMatch(v79,/delete from public\.bz_point_rules|delete from public\.bz_rewards/);
  assert.match(v79,/jsonb_build_object\('bz_points'/);
  assert.match(transfer,/\["bz", "BZ Points y recompensas"\]/);
});

test("P30 exposes BZ metrics from the auditable ledger and redemptions",()=>{
  assert.match(catalog,/bz: "BZ Points"/);
  for(const key of ["bz_points_earned","bz_points_redeemed","bz_earn_events","bz_active_people","bz_redemptions"]) assert.match(catalog,new RegExp(key),key);
  assert.match(engine,/client\.from\("bz_point_ledger"\)/);
  assert.match(engine,/client\.from\("bz_reward_redemptions"\)/);
  assert.match(engine,/entry_type","earn/);
  assert.match(engine,/entry_type","redeem/);
  assert.match(engine,/metric\.block==="bz"/);
});
