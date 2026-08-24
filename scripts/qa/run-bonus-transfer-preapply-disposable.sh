#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/cya_transfer_qa}"
MIGRATION="$ROOT/supabase/migrations/20260824115943_bonus_individual_to_pair_transfer_foundation_01.sql"
BASELINE="$ROOT/tests/postgres/bonus-transfer-preapply-baseline.sql"
REGRESSION="$ROOT/tests/postgres/bonus-transfer-preapply-regression.sql"
ADVERSARIAL="$ROOT/tests/postgres/bonus-transfer-preapply-adversarial.sql"
GATE8="$ROOT/tests/postgres/bonus-transfer-preapply-gate8.sql"
TMPDIR_QA="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_QA"' EXIT

psql_qa() {
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "QA assertion failed: $label — actual=$actual expected=$expected" >&2
    exit 1
  fi
}

run_transfer() {
  local source="$1"
  local partner="$2"
  local minutes="$3"
  local request_key="$4"
  local stdout_file="$5"
  local stderr_file="$6"

  timeout 20s psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -c "select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false); select pg_sleep(0.75); select public.transfer_individual_credit_to_pair_v2($source,$partner,$minutes,'$request_key',null)::text;" \
    >"$stdout_file" 2>"$stderr_file"
}

run_pair() {
  local source="$1"
  local partner="$2"
  local minutes_a="$3"
  local key_a="$4"
  local minutes_b="$5"
  local key_b="$6"
  local prefix="$7"

  set +e
  run_transfer "$source" "$partner" "$minutes_a" "$key_a"     "$TMPDIR_QA/${prefix}-a.out" "$TMPDIR_QA/${prefix}-a.err" &
  local pid_a=$!
  run_transfer "$source" "$partner" "$minutes_b" "$key_b"     "$TMPDIR_QA/${prefix}-b.out" "$TMPDIR_QA/${prefix}-b.err" &
  local pid_b=$!

  wait "$pid_a"
  local rc_a=$?
  wait "$pid_b"
  local rc_b=$?
  set -e

  if [[ "$rc_a" -eq 124 || "$rc_b" -eq 124 ]]; then
    echo "QA concurrency timeout/deadlock in $prefix" >&2
    cat "$TMPDIR_QA/${prefix}-a.err" "$TMPDIR_QA/${prefix}-b.err" >&2 || true
    exit 1
  fi

  if grep -qi "deadlock detected" "$TMPDIR_QA/${prefix}-a.err" "$TMPDIR_QA/${prefix}-b.err"; then
    echo "QA detected PostgreSQL deadlock in $prefix" >&2
    exit 1
  fi

  printf '%s %s\n' "$rc_a" "$rc_b"
}

echo "== Disposable baseline =="
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$BASELINE"

echo "== Apply exact candidate migration to disposable PostgreSQL only =="
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION"

echo "== Runtime regressions for closed findings 001/002 =="
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$REGRESSION"

echo "== QA-BONUS-TRANSFER-003 adversarial runtime =="
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$ADVERSARIAL"

echo "== QA-BONUS-TRANSFER-004 Gate 8 contract runtime =="
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$GATE8"

echo "== QA-BONUS-TRANSFER-004 faithful ACL runtime =="

TEACHER_UID="11111111-1111-1111-1111-111111111111"
TEACHER_ADMIN_UID="22222222-2222-2222-2222-222222222222"
ADMIN_UID="33333333-3333-3333-3333-333333333333"
STUDENT_UID="44444444-4444-4444-4444-444444444444"
NONSTAFF_UID="55555555-5555-5555-5555-555555555555"

run_actor_sql() {
  local role="$1"
  local uid="$2"
  local sql="$3"
  local stdout_file="$4"
  local stderr_file="$5"

  timeout 15s psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    >"$stdout_file" 2>"$stderr_file" <<SQL
\\set VERBOSITY verbose
select set_config('request.jwt.claim.sub','$uid',false);
set role $role;
$sql
SQL
}

expect_actor_allow() {
  local label="$1"
  local uid="$2"
  local source="$3"
  local partner="$4"
  local request_key="$5"
  local prefix="$6"

  run_actor_sql authenticated "$uid" \
    "select public.transfer_individual_credit_to_pair_v2($source,$partner,20,'$request_key',null)::text;" \
    "$TMPDIR_QA/$prefix.out" "$TMPDIR_QA/$prefix.err"

  local result
  result="$(tail -n 1 "$TMPDIR_QA/$prefix.out")"
  if ! jq -e '.status=="committed"' <<<"$result" >/dev/null; then
    echo "QA ACL allow failed for $label: $result" >&2
    exit 1
  fi

  assert_eq "$(psql_qa -c "select actor_user_id::text from public.credit_transfer_operations where request_key='$request_key';")" \
    "$uid" "$label actor_user_id"
}

expect_actor_deny() {
  local label="$1"
  local role="$2"
  local uid="$3"
  local source="$4"
  local partner="$5"
  local request_key="$6"
  local prefix="$7"

  set +e
  run_actor_sql "$role" "$uid" \
    "select public.transfer_individual_credit_to_pair_v2($source,$partner,20,'$request_key',null)::text;" \
    "$TMPDIR_QA/$prefix.out" "$TMPDIR_QA/$prefix.err"
  local rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    echo "QA ACL deny unexpectedly allowed $label" >&2
    cat "$TMPDIR_QA/$prefix.out" >&2 || true
    exit 1
  fi
  if [[ "$rc" -eq 124 ]]; then
    echo "QA ACL deny timed out for $label" >&2
    exit 1
  fi

  assert_eq "$(psql_qa -c "select count(*) from public.credit_transfer_operations where request_key='$request_key';")" \
    "0" "$label creates no canonical operation"
}

psql_qa -c "select qa_transfer.seed_source(5001,1,100);"
psql_qa -c "select qa_transfer.seed_source(5002,3,100);"
psql_qa -c "select qa_transfer.seed_source(5003,5,100);"
psql_qa -c "select qa_transfer.seed_source(5004,7,100);"
psql_qa -c "select qa_transfer.seed_source(5005,9,100);"
psql_qa -c "select qa_transfer.seed_source(5006,11,100);"

expect_actor_allow "teacher allow" "$TEACHER_UID" 5001 2 qa-acl-teacher acl-teacher
expect_actor_allow "teacher_admin allow" "$TEACHER_ADMIN_UID" 5002 4 qa-acl-teacher-admin acl-teacher-admin
expect_actor_allow "admin allow" "$ADMIN_UID" 5003 6 qa-acl-admin acl-admin

expect_actor_deny "student deny" authenticated "$STUDENT_UID" 5004 8 qa-acl-student acl-student
grep -q "No tienes permiso para transferir saldo de bonos" "$TMPDIR_QA/acl-student.err"

expect_actor_deny "authenticated non-staff deny" authenticated "$NONSTAFF_UID" 5005 10 qa-acl-nonstaff acl-nonstaff
grep -q "No tienes permiso para transferir saldo de bonos" "$TMPDIR_QA/acl-nonstaff.err"

expect_actor_deny "anon deny" anon "" 5006 12 qa-acl-anon acl-anon
grep -qi "permission denied for function transfer_individual_credit_to_pair_v2" "$TMPDIR_QA/acl-anon.err"

set +e
run_actor_sql authenticated "$TEACHER_UID" \
  "insert into public.credit_movements(grant_id,movement_type,delta_minutes,created_by,transfer_id) values(5001,'transfer_out',-1,auth.uid(),999999999);" \
  "$TMPDIR_QA/acl-forgery.out" "$TMPDIR_QA/acl-forgery.err"
forgery_rc=$?
set -e
if [[ "$forgery_rc" -eq 0 || "$forgery_rc" -eq 124 ]]; then
  echo "QA direct-DML transfer forgery was not fail-closed" >&2
  exit 1
fi
grep -qi "row-level security" "$TMPDIR_QA/acl-forgery.err"
assert_eq "$(psql_qa -c "select count(*) from public.credit_movements where transfer_id=999999999;")" \
  "0" "direct-DML transfer forgery persists no row"

echo "QA-BONUS-TRANSFER-004 ACL RUNTIME: PASS"

echo "== Concurrency 1: overspend race =="
psql_qa -c "select qa_transfer.seed_source(2001,13,300);"
read -r rc_a rc_b < <(run_pair 2001 14 200 qa-conc-over-a 200 qa-conc-over-b overspend)
successes=0
[[ "$rc_a" -eq 0 ]] && successes=$((successes+1))
[[ "$rc_b" -eq 0 ]] && successes=$((successes+1))
assert_eq "$successes" "1" "overspend race exactly one transfer commits"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(2001);")" "100" "overspend source balance"
assert_eq "$(psql_qa -c "select count(*) from public.credit_transfer_operations where source_grant_id=2001 and operation_type='transfer';")" "1" "overspend transfer count"
assert_eq "$(psql_qa -c "select count(*) from public.credit_pair_transfer_pools where economic_source_grant_id=2001;")" "1" "overspend pool count"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(destination_grant_id) from public.credit_pair_transfer_pools where economic_source_grant_id=2001;")" "200" "overspend destination balance"

echo "== Concurrency 2 + 4: two valid requests and same pool race =="
psql_qa -c "select qa_transfer.seed_source(2002,15,500);"
read -r rc_a rc_b < <(run_pair 2002 16 120 qa-conc-valid-a 130 qa-conc-valid-b valid)
assert_eq "$rc_a" "0" "valid concurrent request A"
assert_eq "$rc_b" "0" "valid concurrent request B"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(2002);")" "250" "valid concurrent source balance"
assert_eq "$(psql_qa -c "select count(*) from public.credit_transfer_operations where source_grant_id=2002 and operation_type='transfer';")" "2" "valid concurrent transfer count"
assert_eq "$(psql_qa -c "select count(*) from public.credit_pair_transfer_pools where economic_source_grant_id=2002;")" "1" "valid concurrent maximum one compatible pool"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(destination_grant_id) from public.credit_pair_transfer_pools where economic_source_grant_id=2002;")" "250" "valid concurrent destination balance"

echo "== Concurrency 3: same request_key converges =="
psql_qa -c "select qa_transfer.seed_source(2003,17,300);"
read -r rc_a rc_b < <(run_pair 2003 18 100 qa-conc-same-key 100 qa-conc-same-key samekey)
assert_eq "$rc_a" "0" "same-key concurrent request A"
assert_eq "$rc_b" "0" "same-key concurrent request B"
transfer_a="$(tail -n 1 "$TMPDIR_QA/samekey-a.out" | jq -r '.transfer_id')"
transfer_b="$(tail -n 1 "$TMPDIR_QA/samekey-b.out" | jq -r '.transfer_id')"
assert_eq "$transfer_a" "$transfer_b" "same request_key returns same transfer_id"
assert_eq "$(psql_qa -c "select count(*) from public.credit_transfer_operations where request_key='qa-conc-same-key';")" "1" "same-key one canonical operation"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(2003);")" "200" "same-key source charged once"
assert_eq "$(psql_qa -c "select count(*) from public.credit_pair_transfer_pools where economic_source_grant_id=2003;")" "1" "same-key one compatible pool"
assert_eq "$(psql_qa -c "select private.credit_grant_balance_minutes_unchecked(destination_grant_id) from public.credit_pair_transfer_pools where economic_source_grant_id=2003;")" "100" "same-key destination credited once"

echo "== Global canonical ledger invariant after multi-session tests =="
invalid_ops="$(psql_qa -c "
  select count(*)
  from (
    select op.id
    from public.credit_transfer_operations op
    left join public.credit_movements cm on cm.transfer_id=op.id
    group by op.id,op.minutes
    having count(*) filter (where cm.movement_type='transfer_out')<>1
       or count(*) filter (where cm.movement_type='transfer_in')<>1
       or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_out'),0)<>-op.minutes
       or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_in'),0)<>op.minutes
       or coalesce(sum(cm.delta_minutes),0)<>0
  ) invalid;
")"
assert_eq "$invalid_ops" "0" "all canonical operations preserve -X/+X conservation"

echo "QA-BONUS-TRANSFER-001/002 REGRESSION: PASS"
echo "QA-BONUS-TRANSFER-003 RUNTIME: PASS"
echo "QA-BONUS-TRANSFER-004 CONTRACT + ACL RUNTIME: PASS"
echo "BONUS TRANSFER PRE-APPLY DISPOSABLE HARNESS: PASS"
