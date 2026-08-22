import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FIXTURES_RAW = process.env.QA_FIXTURES_JSON;
const MARKER_PREFIX = "CYA_ATTENDANCE_AUTH_GATE:POST_APPLY_M1";
const LOCATION_PREFIX = "QA Attendance Auth Gate";
const PHASES = new Set(["NEW", "ATTENDANCE_READY", "FINISH_CONFIRMED", "COMPLETE"]);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function markerForRun(runId) {
  assert.match(String(runId ?? ""), /^\d+$/, "QA_RUN_ID must be the numeric GitHub Actions run id");
  return `${MARKER_PREFIX}:${runId}`;
}

function correctionReason(marker) {
  return `${marker}:CORRECTION`;
}

function restoreReason(marker) {
  return `${correctionReason(marker)}:RESTORE`;
}

function phaseValue(marker, phase) {
  assert.ok(PHASES.has(phase), `Unknown Attendance QA phase: ${phase}`);
  return `${LOCATION_PREFIX}:${marker}:PHASE:${phase}`;
}

function parsePhase(value, marker) {
  const prefix = `${LOCATION_PREFIX}:${marker}:PHASE:`;
  assert.ok(typeof value === "string" && value.startsWith(prefix), "Attendance QA fixture phase marker is missing or belongs to another run");
  const phase = value.slice(prefix.length);
  assert.ok(PHASES.has(phase), `Unexpected Attendance QA fixture phase: ${phase}`);
  return phase;
}

function classifyAttendanceHistory(events, marker) {
  assert.ok(Array.isArray(events), "Attendance history must be an array");
  if (events.length === 0) return { state: "EMPTY", present: null, absent: null, restored: null };
  assert.ok(events.length <= 3, `Unexpected Attendance QA history length: ${events.length}`);

  const present = events[0];
  assert.ok(Number.isSafeInteger(Number(present.id)), "Attendance seed event must have a numeric id");
  assert.equal(present.attendance_status, "present", "First Attendance QA event must be present");
  assert.equal(present.absence_reason, null, "Initial present event cannot have an absence reason");
  assert.equal(present.source, "explicit_record", "Initial Attendance QA event must come from explicit_record");
  assert.equal(present.supersedes_event_id, null, "Initial Attendance QA event cannot supersede another event");
  assert.equal(present.correction_reason, null, "Initial Attendance QA event cannot have a correction reason");
  if (events.length === 1) return { state: "PRESENT_ONLY", present, absent: null, restored: null };

  const absent = events[1];
  assert.ok(Number.isSafeInteger(Number(absent.id)), "Attendance correction event must have a numeric id");
  assert.equal(absent.attendance_status, "absent", "Second Attendance QA event must be absent");
  assert.equal(absent.absence_reason, "no_show", "Second Attendance QA event must preserve no_show");
  assert.equal(absent.source, "correction", "Second Attendance QA event must be a correction");
  assert.equal(Number(absent.supersedes_event_id), Number(present.id), "Attendance correction must supersede the initial present event");
  assert.equal(absent.correction_reason, correctionReason(marker), "Attendance correction must belong to this exact QA run marker");
  if (events.length === 2) return { state: "ATTENDANCE_READY", present, absent, restored: null };

  const restored = events[2];
  assert.ok(Number.isSafeInteger(Number(restored.id)), "Attendance restore event must have a numeric id");
  assert.equal(restored.attendance_status, "present", "Third Attendance QA event must restore present");
  assert.equal(restored.absence_reason, null, "Restored present event cannot have an absence reason");
  assert.equal(restored.source, "correction", "Restored Attendance QA event must be a correction");
  assert.equal(Number(restored.supersedes_event_id), Number(absent.id), "Restore correction must supersede the absent correction");
  assert.equal(restored.correction_reason, restoreReason(marker), "Restore correction must belong to this exact QA run marker");
  return { state: "COMPLETE", present, absent, restored };
}

function selfTestRerunPolicy() {
  const marker = markerForRun("1001");
  assert.notEqual(marker, markerForRun("1002"), "Different GitHub runs must never share an Attendance QA marker");
  assert.equal(classifyAttendanceHistory([], marker).state, "EMPTY");

  const present = {
    id: 10,
    attendance_status: "present",
    absence_reason: null,
    source: "explicit_record",
    supersedes_event_id: null,
    correction_reason: null,
  };
  assert.equal(classifyAttendanceHistory([present], marker).state, "PRESENT_ONLY");

  const absent = {
    id: 11,
    attendance_status: "absent",
    absence_reason: "no_show",
    source: "correction",
    supersedes_event_id: 10,
    correction_reason: correctionReason(marker),
  };
  assert.equal(classifyAttendanceHistory([present, absent], marker).state, "ATTENDANCE_READY");

  const restored = {
    id: 12,
    attendance_status: "present",
    absence_reason: null,
    source: "correction",
    supersedes_event_id: 11,
    correction_reason: restoreReason(marker),
  };
  assert.equal(classifyAttendanceHistory([present, absent, restored], marker).state, "COMPLETE");
  assert.throws(
    () => classifyAttendanceHistory([present, { ...absent, correction_reason: "unexpected" }], marker),
    /exact QA run marker/,
    "Unexpected history must fail closed rather than being reused",
  );

  const allowedAttendanceMutations = new Set(["record", "correct"]);
  assert.equal(allowedAttendanceMutations.has("delete"), false, "Attendance QA reruns must never delete history");
  assert.equal(allowedAttendanceMutations.has("rewrite"), false, "Attendance QA reruns must never rewrite history");
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

async function loadAttendanceHistory(supabase, classId, personId) {
  const { data, error } = await supabase
    .from("class_attendance_events")
    .select("id,attendance_status,absence_reason,source,supersedes_event_id,correction_reason")
    .eq("class_id", classId)
    .eq("person_id", personId)
    .order("id", { ascending: true });
  if (error) throw new Error(`load Attendance QA history failed: ${error.code ?? "unknown"} ${error.message}`);
  return data ?? [];
}

async function setPhase(supabase, classId, marker, phase) {
  const { data, error } = await supabase
    .from("classes")
    .update({ location_text: phaseValue(marker, phase) })
    .eq("id", classId)
    .eq("notes", marker)
    .select("id,location_text")
    .single();
  if (error || !data) throw error ?? new Error(`Unable to persist Attendance QA phase ${phase}`);
  assert.equal(parsePhase(data.location_text, marker), phase);
}

async function main() {
  selfTestRerunPolicy();
  assert.ok(SUPABASE_URL?.includes("qlngfkzmncihtdzktcmd"), "Attendance auth gate must target Supabase STAGING");
  assert.ok(SUPABASE_KEY, "Publishable key is required");
  assert.ok(FIXTURES_RAW, "QA_FIXTURES_JSON is required");

  const runId = required("QA_RUN_ID");
  const marker = markerForRun(runId);
  const correction = correctionReason(marker);
  const restore = restoreReason(marker);
  const fixtures = JSON.parse(FIXTURES_RAW);
  const teacher = await signIn("teacher");
  const student = await signIn("student");
  const admin = await signIn("admin");

  try {
    const studentPerson = await one(
      "resolve QA student person via authorized staff session",
      teacher.supabase
        .from("people")
        .select("id,source,auth_user_id")
        .eq("auth_user_id", student.user.id)
        .eq("source", "qa_automation")
        .single(),
    );
    assert.equal(studentPerson.auth_user_id, student.user.id, "Resolved person must belong to the authenticated QA Student");
    assert.equal(studentPerson.source, "qa_automation", "Resolved person must be the canonical QA automation identity");
    const studentPersonId = Number(studentPerson.id);
    assert.ok(Number.isSafeInteger(studentPersonId), "QA student person_id must be a safe integer");

    let { data: gateClass, error: gateLookupError } = await teacher.supabase
      .from("classes")
      .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes,location_text")
      .eq("notes", marker)
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
          .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes,location_text")
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
          .update({ label: `${marker}:BONO` })
          .eq("id", participants.preferred_billing_grant_id);
        if (error) throw new Error(`mark dedicated gate grant failed: ${error.code ?? "unknown"} ${error.message}`);
      }

      const { data, error } = await teacher.supabase
        .from("classes")
        .update({ notes: marker, location_text: phaseValue(marker, "NEW") })
        .eq("id", bootstrapClassId)
        .select("id,status,scheduled_start_at,duration_minutes,administrative_finished_at,notes,location_text")
        .single();
      if (error || !data) throw error ?? new Error("Unable to promote dedicated attendance fixture");
      gateClass = data;
    }

    assert.equal(gateClass.notes, marker, "Attendance QA fixture must belong to this exact GitHub run");
    let phase = parsePhase(gateClass.location_text, marker);
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

    let refreshed = await one(
      "reload dedicated gate class",
      teacher.supabase
        .from("classes")
        .select("id,status,duration_minutes,administrative_finished_at,location_text")
        .eq("id", classId)
        .single(),
    );

    let history = classifyAttendanceHistory(await loadAttendanceHistory(teacher.supabase, classId, studentPersonId), marker);
    const classFinished = Boolean(refreshed.administrative_finished_at) || refreshed.status === "finished";

    if (phase === "COMPLETE") {
      assert.equal(history.state, "COMPLETE", "COMPLETE phase requires the exact three-event QA history");
      assert.equal(classFinished, false, "COMPLETE Attendance QA fixture must already be reopened");
    } else if (phase === "FINISH_CONFIRMED") {
      assert.ok(history.state === "ATTENDANCE_READY" || history.state === "COMPLETE", "FINISH_CONFIRMED requires expected durable Attendance history");
    } else if (phase === "ATTENDANCE_READY") {
      assert.equal(history.state, "ATTENDANCE_READY", "ATTENDANCE_READY phase requires present -> absent correction history");
    }

    if (!classFinished && phase !== "COMPLETE" && phase !== "FINISH_CONFIRMED" && refreshed.status !== "active") {
      assert.ok(history.state === "EMPTY" || history.state === "PRESENT_ONLY", "Only a fresh QA fixture may be moved into active state directly");
      const { data, error } = await teacher.supabase
        .from("classes")
        .update({ status: "active", workflow_stage: "live", administrative_finished_at: null })
        .eq("id", classId)
        .eq("notes", marker)
        .select("id,status,duration_minutes,administrative_finished_at,location_text")
        .single();
      if (error || !data) throw error ?? new Error("Unable to place dedicated QA fixture in active state");
      assert.equal(data.status, "active");
      refreshed = data;
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
        p_reason: correction,
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

    if (history.state === "EMPTY") {
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
      history = classifyAttendanceHistory(await loadAttendanceHistory(teacher.supabase, classId, studentPersonId), marker);
      assert.equal(history.state, "PRESENT_ONLY");
    }

    if (history.state === "PRESENT_ONLY") {
      const absentEvent = await mustRpc(
        "staff correct_class_attendance",
        teacher.supabase.rpc("correct_class_attendance", {
          p_class_id: classId,
          p_person_id: studentPersonId,
          p_attendance_status: "absent",
          p_absence_reason: "no_show",
          p_reason: correction,
        }),
      );
      assert.equal(absentEvent.attendance_status, "absent");
      assert.ok(absentEvent.supersedes_event_id, "Correction must supersede the previous attendance event");
      history = classifyAttendanceHistory(await loadAttendanceHistory(teacher.supabase, classId, studentPersonId), marker);
      assert.equal(history.state, "ATTENDANCE_READY");
    }

    if (history.state === "ATTENDANCE_READY") {
      assert.equal(history.present.attendance_status, "present");
      assert.equal(history.absent.attendance_status, "absent");
      if (phase === "NEW") {
        await setPhase(teacher.supabase, classId, marker, "ATTENDANCE_READY");
        phase = "ATTENDANCE_READY";
      }
    }

    refreshed = await one(
      "reload class before finish/reentry decision",
      teacher.supabase
        .from("classes")
        .select("id,status,duration_minutes,administrative_finished_at,location_text")
        .eq("id", classId)
        .single(),
    );

    const alreadyFinished = Boolean(refreshed.administrative_finished_at) || refreshed.status === "finished";
    let finishWasExecutedThisInvocation = false;

    if (history.state !== "COMPLETE" && phase !== "FINISH_CONFIRMED") {
      if (!alreadyFinished) {
        assert.equal(phase, "ATTENDANCE_READY", "Administrative finish may run only after the exact expected attendance history is ready");
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
        finishWasExecutedThisInvocation = true;
      }

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

      await setPhase(teacher.supabase, classId, marker, "FINISH_CONFIRMED");
      phase = "FINISH_CONFIRMED";
    }

    if (history.state === "ATTENDANCE_READY" && phase === "FINISH_CONFIRMED") {
      const currentClass = await one(
        "reload class before safe reopen",
        teacher.supabase
          .from("classes")
          .select("status,administrative_finished_at")
          .eq("id", classId)
          .single(),
      );

      const { count: beforeReopenCount, error: countBeforeError } = await teacher.supabase
        .from("class_attendance_events")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId)
        .eq("person_id", studentPersonId);
      if (countBeforeError) throw countBeforeError;

      if (currentClass.status === "finished" || currentClass.administrative_finished_at) {
        await mustRpc(
          "staff reopen_administratively_finished_class",
          admin.supabase.rpc("reopen_administratively_finished_class", { p_class_id: classId }),
        );
      } else {
        assert.equal(currentClass.status, "active", "A FINISH_CONFIRMED rerun may skip reopen only when the prior invocation already reopened the QA class");
      }

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
          p_reason: restore,
        }),
      );
      assert.equal(restoredPresent.attendance_status, "present");
      history = classifyAttendanceHistory(await loadAttendanceHistory(teacher.supabase, classId, studentPersonId), marker);
      assert.equal(history.state, "COMPLETE");
      await setPhase(teacher.supabase, classId, marker, "COMPLETE");
      phase = "COMPLETE";
    } else if (history.state === "COMPLETE") {
      if (phase === "FINISH_CONFIRMED") {
        await setPhase(teacher.supabase, classId, marker, "COMPLETE");
        phase = "COMPLETE";
      }
      assert.equal(phase, "COMPLETE", "Complete Attendance history may only be reused for the exact completed QA run");
    }

    const finalProjection = await one(
      "verify final effective attendance projection",
      teacher.supabase
        .from("class_participants")
        .select("attendance_status")
        .eq("class_id", classId)
        .eq("person_id", studentPersonId)
        .single(),
    );
    assert.equal(finalProjection.attendance_status, "present");

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
      latest_event_id: history.restored?.id ?? history.absent?.id ?? history.present?.id ?? null,
      fixture_marker: marker,
      fixture_phase: phase,
      finish_executed_this_invocation: finishWasExecutedThisInvocation,
      reused_existing_history: !finishWasExecutedThisInvocation && history.state === "COMPLETE",
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