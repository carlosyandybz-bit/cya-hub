import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FIXTURES_RAW = process.env.QA_FIXTURES_JSON;
const MARKER = "CYA_ATTENDANCE_AUTH_GATE:POST_APPLY_M1";
const CORRECTION_REASON = `${MARKER}:CORRECTION`;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function client() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(role) {
  const email = required(`QA_${role.toUpperCase()}_EMAIL`);
  const password = required(`QA_${role.toUpperCase()}_PASSWORD`);
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw error ?? new Error(`Unable to authenticate ${role}`);
  return { supabase, user: data.user, email };
}

function rpcCode(error) {
  return error?.code ?? error?.details?.code ?? null;
}

async function expectDenied(label, promise) {
  const { error } = await promise;
  assert.ok(error, `${label} must be denied`);
  assert.equal(rpcCode(error), "42501", `${label} must fail with authorization code 42501`);
}

async function mustRpc(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label} failed: ${error.code ?? "unknown"} ${error.message}`);
  return data;
}

async function one(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label} failed: ${error.code ?? "unknown"} ${error.message}`);
  if (!data) throw new Error(`${label} returned no row`);
  return data;
}

async function main() {
  assert.ok(SUPABASE_URL?.includes("qlngfkzmncihtdzktcmd"), "Attendance auth gate must target Supabase STAGING");
  assert.ok(SUPABASE_KEY, "Publishable key is required");
  assert.ok(FIXTURES_RAW, "QA_FIXTURES_JSON is required");

  const fixtures = JSON.parse(FIXTURES_RAW);
  const teacher = await signIn("teacher");
  const student = await signIn("student");
  const admin = await signIn("admin");

  try {
    const studentPerson = await one(
      "resolve QA student person",
      student.supabase
        .from("people")
        .select("id,source,auth_user_id")
        .eq("auth_user_id", student.user.id)
        .eq("source", "qa_automation")
        .single(),
    );
    const studentPersonId = Number(studentPerson.id);
    assert.ok(Number.isSafeInteger(studentPersonId), "QA student person_id must be a safe integer");

    let { data: gateClass, error: gateLookupError } = await teacher.supabase
      .from("classes")
      .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes")
      .eq("notes", MARKER)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (gateLookupError) throw gateLookupError;

    if (!gateClass) {
      const bootstrapClassId = Number(fixtures?.projects?.["desktop-chromium"]?.classId);
      assert.ok(Number.isSafeInteger(bootstrapClassId), "Bootstrap desktop fixture class_id is required");
      const bootstrapClass = await one(
        "load bootstrap class for dedicated attendance fixture",
        teacher.supabase
          .from("classes")
          .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes")
          .eq("id", bootstrapClassId)
          .single(),
      );
      assert.match(bootstrapClass.notes ?? "", /^CYA_QA:/, "Only a disposable CYA_QA fixture may be promoted into the durable attendance gate fixture");

      const participants = await one(
        "load bootstrap class participant",
        teacher.supabase
          .from("class_participants")
          .select("person_id,preferred_billing_grant_id")
          .eq("class_id", bootstrapClassId)
          .eq("person_id", studentPersonId)
          .single(),
      );

      if (participants.preferred_billing_grant_id) {
        const { error } = await teacher.supabase
          .from("credit_grants")
          .update({ label: `${MARKER}:BONO` })
          .eq("id", participants.preferred_billing_grant_id);
        if (error) throw new Error(`mark dedicated gate grant failed: ${error.code ?? "unknown"} ${error.message}`);
      }

      const { data, error } = await teacher.supabase
        .from("classes")
        .update({ notes: MARKER, location_text: "QA Attendance Auth Gate" })
        .eq("id", bootstrapClassId)
        .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes")
        .single();
      if (error || !data) throw error ?? new Error("Unable to promote dedicated attendance fixture");
      gateClass = data;
    }

    const classId = Number(gateClass.id);
    assert.ok(Number.isSafeInteger(classId), "Attendance gate class_id must be a safe integer");

    const gateParticipants = await one(
      "verify dedicated gate participant",
      teacher.supabase
        .from("class_participants")
        .select("person_id,attendance_status,preferred_billing_grant_id")
        .eq("class_id", classId)
        .eq("person_id", studentPersonId)
        .single(),
    );
    assert.equal(Number(gateParticipants.person_id), studentPersonId);

    if (gateClass.administrative_finished_at || gateClass.status === "finished") {
      await mustRpc(
        "staff reopen fixture before auth probes",
        teacher.supabase.rpc("reopen_administratively_finished_class", { p_class_id: classId }),
      );
    }

    const refreshed = await one(
      "reload dedicated gate class",
      teacher.supabase
        .from("classes")
        .select("id,status,duration_minutes,administrative_finished_at")
        .eq("id", classId)
        .single(),
    );

    if (refreshed.status !== "active") {
      const { data, error } = await teacher.supabase
        .from("classes")
        .update({ status: "active", workflow_stage: "live", administrative_finished_at: null })
        .eq("id", classId)
        .select("id,status,duration_minutes,administrative_finished_at")
        .single();
      if (error || !data) throw error ?? new Error("Unable to place dedicated QA fixture in active state");
      assert.equal(data.status, "active");
    }

    await expectDenied(
      "student record_class_attendance",
      student.supabase.rpc("record_class_attendance", {
        p_class_id: classId,
        p_person_id: studentPersonId,
        p_attendance_status: "present",
        p_absence_reason: null,
      }),
    );
    await expectDenied(
      "student correct_class_attendance",
      student.supabase.rpc("correct_class_attendance", {
        p_class_id: classId,
        p_person_id: studentPersonId,
        p_attendance_status: "absent",
        p_absence_reason: "no_show",
        p_reason: CORRECTION_REASON,
      }),
    );
    await expectDenied(
      "student administratively_finish_class_v4",
      student.supabase.rpc("administratively_finish_class_v4", {
        p_class_id: classId,
        p_person_ids: [studentPersonId],
        p_grant_ids: [null],
        p_duration_minutes: Number(refreshed.duration_minutes ?? 60),
        p_direct_payment_price_cents: null,
        p_pair_transfer_source_grant_id: null,
        p_pair_transfer_fee_cents: 0,
        p_supplements: [],
      }),
    );
    await expectDenied(
      "student reopen_administratively_finished_class",
      student.supabase.rpc("reopen_administratively_finished_class", { p_class_id: classId }),
    );

    const presentEvent = await mustRpc(
      "staff record_class_attendance",
      teacher.supabase.rpc("record_class_attendance", {
        p_class_id: classId,
        p_person_id: studentPersonId,
        p_attendance_status: "present",
        p_absence_reason: null,
      }),
    );
    assert.equal(presentEvent.attendance_status, "present");

    const absentEvent = await mustRpc(
      "staff correct_class_attendance",
      teacher.supabase.rpc("correct_class_attendance", {
        p_class_id: classId,
        p_person_id: studentPersonId,
        p_attendance_status: "absent",
        p_absence_reason: "no_show",
        p_reason: CORRECTION_REASON,
      }),
    );
    assert.equal(absentEvent.attendance_status, "absent");
    assert.ok(absentEvent.supersedes_event_id, "Correction must supersede the previous attendance event");

    const original = await one(
      "verify original attendance event is preserved",
      teacher.supabase
        .from("class_attendance_events")
        .select("id,attendance_status,source")
        .eq("id", absentEvent.supersedes_event_id)
        .single(),
    );
    assert.equal(original.attendance_status, "present");

    await mustRpc(
      "staff administratively_finish_class_v4",
      teacher.supabase.rpc("administratively_finish_class_v4", {
        p_class_id: classId,
        p_person_ids: [studentPersonId],
        p_grant_ids: [null],
        p_duration_minutes: Number(refreshed.duration_minutes ?? 60),
        p_direct_payment_price_cents: null,
        p_pair_transfer_source_grant_id: null,
        p_pair_transfer_fee_cents: 0,
        p_supplements: [],
      }),
    );

    const finished = await one(
      "verify administrative finish",
      teacher.supabase
        .from("classes")
        .select("status,administrative_finished_at")
        .eq("id", classId)
        .single(),
    );
    assert.equal(finished.status, "finished");
    assert.ok(finished.administrative_finished_at, "Administrative finish must set administrative_finished_at");

    const afterFinish = await one(
      "verify finish does not manufacture blanket present",
      teacher.supabase
        .from("class_participants")
        .select("attendance_status")
        .eq("class_id", classId)
        .eq("person_id", studentPersonId)
        .single(),
    );
    assert.equal(afterFinish.attendance_status, "absent");

    const { count: beforeReopenCount, error: countBeforeError } = await teacher.supabase
      .from("class_attendance_events")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("person_id", studentPersonId);
    if (countBeforeError) throw countBeforeError;

    await mustRpc(
      "staff reopen_administratively_finished_class",
      admin.supabase.rpc("reopen_administratively_finished_class", { p_class_id: classId }),
    );

    const { count: afterReopenCount, error: countAfterError } = await teacher.supabase
      .from("class_attendance_events")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("person_id", studentPersonId);
    if (countAfterError) throw countAfterError;
    assert.equal(afterReopenCount, beforeReopenCount, "Reopen must not delete or manufacture attendance history");

    const afterReopen = await one(
      "verify reopen preserves attendance projection",
      teacher.supabase
        .from("class_participants")
        .select("attendance_status")
        .eq("class_id", classId)
        .eq("person_id", studentPersonId)
        .single(),
    );
    assert.equal(afterReopen.attendance_status, "absent");

    const restoredPresent = await mustRpc(
      "staff correction restores effective present state",
      teacher.supabase.rpc("correct_class_attendance", {
        p_class_id: classId,
        p_person_id: studentPersonId,
        p_attendance_status: "present",
        p_absence_reason: null,
        p_reason: `${CORRECTION_REASON}:RESTORE`,
      }),
    );
    assert.equal(restoredPresent.attendance_status, "present");

    const hasRealTeacher = await mustRpc(
      "teacher has_real_attendance",
      teacher.supabase.rpc("has_real_attendance", { p_person_id: studentPersonId }),
    );
    assert.equal(hasRealTeacher, true);
    const firstReal = await mustRpc(
      "teacher first_real_attendance",
      teacher.supabase.rpc("first_real_attendance", { p_person_id: studentPersonId }),
    );
    const lastReal = await mustRpc(
      "teacher last_real_attendance",
      teacher.supabase.rpc("last_real_attendance", { p_person_id: studentPersonId }),
    );
    assert.ok(firstReal, "first_real_attendance must return a timestamp");
    assert.ok(lastReal, "last_real_attendance must return a timestamp");

    const hasRealSelf = await mustRpc(
      "student self has_real_attendance",
      student.supabase.rpc("has_real_attendance", { p_person_id: studentPersonId }),
    );
    assert.equal(hasRealSelf, true);

    const futureClassId = Number(fixtures?.projects?.["iphone-large-chromium"]?.classId);
    assert.ok(Number.isSafeInteger(futureClassId), "Bootstrap iPhone fixture is required for future-class predicate probe");
    if (futureClassId !== classId) {
      const futureBefore = await one(
        "load disposable future predicate fixture",
        teacher.supabase
          .from("classes")
          .select("scheduled_start_at,status,cancelled_at,notes")
          .eq("id", futureClassId)
          .single(),
      );
      assert.match(futureBefore.notes ?? "", /^CYA_QA:/, "Future-class probe may only use the disposable bootstrap fixture");
      const futureAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: futureUpdateError } = await teacher.supabase
        .from("classes")
        .update({ status: "scheduled", scheduled_start_at: futureAt, cancelled_at: null })
        .eq("id", futureClassId);
      if (futureUpdateError) throw futureUpdateError;
      try {
        const hasFutureTeacher = await mustRpc(
          "teacher has_valid_future_class",
          teacher.supabase.rpc("has_valid_future_class", { p_person_id: studentPersonId }),
        );
        const hasFutureSelf = await mustRpc(
          "student self has_valid_future_class",
          student.supabase.rpc("has_valid_future_class", { p_person_id: studentPersonId }),
        );
        assert.equal(hasFutureTeacher, true);
        assert.equal(hasFutureSelf, true);
      } finally {
        const { error: restoreError } = await teacher.supabase
          .from("classes")
          .update({
            status: futureBefore.status,
            scheduled_start_at: futureBefore.scheduled_start_at,
            cancelled_at: futureBefore.cancelled_at,
          })
          .eq("id", futureClassId);
        if (restoreError) throw restoreError;
      }
    }

    console.log(JSON.stringify({
      gate: "QA-BLOCK-ATTENDANCE-AUTH-01",
      result: "PASS",
      class_id: classId,
      person_id: studentPersonId,
      latest_event_id: restoredPresent.id,
      fixture_marker: MARKER,
      credentials_logged: false,
      tokens_logged: false,
    }));
  } finally {
    await Promise.all([
      teacher.supabase.auth.signOut(),
      student.supabase.auth.signOut(),
      admin.supabase.auth.signOut(),
    ]);
  }
}

main().catch((error) => {
  console.error(`Attendance authenticated gate failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
