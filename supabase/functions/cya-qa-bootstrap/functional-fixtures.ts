import postgres from "npm:postgres@3.4.9";

type Sql = ReturnType<typeof postgres>;

type QaProjectFixture = {
  classId: number;
  durationMinutes: number;
  durationLabel: string;
  creditLabel: string;
};

type QaFunctionalFixtures = {
  studentName: string;
  style: string;
  role: string;
  level: string;
  projects: Record<string, QaProjectFixture>;
};

const QA_TEACHER_EMAIL = "carlosyandybz+qa-teacher@gmail.com";
const QA_STUDENT_EMAIL = "carlosyandybz+qa-student@gmail.com";
const QA_PREFIX = "CYA_QA:";

async function requireIdentity(sql: Sql, email: string) {
  const rows = await sql<{ user_id: string; person_id: string; display_name: string }[]>`
    select auth_user_id::text as user_id, id::text as person_id, display_name
    from public.people
    where lower(email) = lower(${email})
      and source = 'qa_automation'
      and active = true
    limit 1
  `;
  const row = rows[0];
  if (!row?.user_id || !row?.person_id) throw new Error(`Missing QA identity for ${email}`);
  return row;
}

async function cleanupOldFunctionalFixtures(sql: Sql, teacherUserId: string) {
  const classRows = await sql<{ id: string }[]>`
    select c.id::text as id
    from public.classes c
    where c.teacher_user_id = ${teacherUserId}::uuid
      and c.notes like ${`${QA_PREFIX}%`}
      and not exists (
        select 1
        from public.class_participants cp
        join public.people p on p.id = cp.person_id
        where cp.class_id = c.id
          and p.source is distinct from 'qa_automation'
      )
      and not exists (
        select 1 from public.student_incidents si where si.related_class_id = c.id
      )
  `;
  for (const row of classRows) {
    await sql`delete from public.classes where id = ${row.id}::bigint`;
  }

  const grantRows = await sql<{ id: string }[]>`
    select g.id::text as id
    from public.credit_grants g
    where g.label like ${`${QA_PREFIX}%`}
      and not exists (
        select 1
        from public.credit_grant_members gm
        join public.people p on p.id = gm.person_id
        where gm.grant_id = g.id
          and p.source is distinct from 'qa_automation'
      )
  `;
  for (const row of grantRows) {
    await sql`delete from public.credit_movements where grant_id = ${row.id}::bigint`;
    await sql`delete from public.credit_grants where id = ${row.id}::bigint`;
  }
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} h` : "", remainder ? `${remainder} min` : ""].filter(Boolean).join(" ");
}

async function createProjectFixture(
  sql: Sql,
  runId: string,
  projectName: string,
  durationMinutes: number,
  offsetMinutes: number,
  teacherUserId: string,
  studentPersonId: string,
): Promise<QaProjectFixture> {
  const marker = `${QA_PREFIX}${runId}:${projectName}`;
  const creditLabel = `${marker}:BONO`;
  const classRows = await sql<{ id: string }[]>`
    insert into public.classes (
      teacher_user_id,
      class_type,
      status,
      scheduled_start_at,
      duration_minutes,
      style_term_id,
      notes,
      location_text,
      workflow_stage,
      created_by
    ) values (
      ${teacherUserId}::uuid,
      'individual',
      'scheduled',
      now() + (${offsetMinutes}::integer * interval '1 minute'),
      ${durationMinutes},
      1,
      ${marker},
      'QA Studio',
      'prepare',
      ${teacherUserId}::uuid
    )
    returning id::text as id
  `;
  const classId = classRows[0]?.id;
  if (!classId) throw new Error(`Unable to create QA class for ${projectName}`);

  const grantRows = await sql<{ id: string }[]>`
    insert into public.credit_grants (
      modality,
      label,
      total_minutes,
      price_cents,
      payment_status,
      status,
      purchased_at,
      expires_at,
      created_by
    ) values (
      'individual',
      ${creditLabel},
      600,
      0,
      'paid',
      'active',
      now(),
      now() + interval '30 days',
      ${teacherUserId}::uuid
    )
    returning id::text as id
  `;
  const grantId = grantRows[0]?.id;
  if (!grantId) throw new Error(`Unable to create QA credit for ${projectName}`);

  await sql`
    insert into public.credit_grant_members (grant_id, person_id)
    values (${grantId}::bigint, ${studentPersonId}::bigint)
  `;
  await sql`
    insert into public.credit_movements (
      grant_id, person_id, class_id, movement_type, delta_minutes, note, created_by
    ) values (
      ${grantId}::bigint,
      ${studentPersonId}::bigint,
      null,
      'grant',
      600,
      ${marker},
      ${teacherUserId}::uuid
    )
  `;
  await sql`
    insert into public.class_participants (
      class_id,
      person_id,
      attendance_status,
      role_term_id,
      level_term_id,
      preferred_billing_grant_id,
      billing_status
    ) values (
      ${classId}::bigint,
      ${studentPersonId}::bigint,
      'planned',
      5,
      7,
      ${grantId}::bigint,
      'planned'
    )
  `;

  return {
    classId: Number(classId),
    durationMinutes,
    durationLabel: durationLabel(durationMinutes),
    creditLabel,
  };
}

export async function seedFunctionalQaFixtures(sql: Sql, runId: string): Promise<QaFunctionalFixtures> {
  const teacher = await requireIdentity(sql, QA_TEACHER_EMAIL);
  const student = await requireIdentity(sql, QA_STUDENT_EMAIL);

  await cleanupOldFunctionalFixtures(sql, teacher.user_id);

  await sql`
    update public.student_profiles
    set goals = 'QA: comprobar el flujo completo de clase y portal.',
        teacher_notes = 'QA AUTOMATION — datos de prueba aislados.',
        health_notes = null,
        updated_at = now()
    where person_id = ${student.person_id}::bigint
  `;
  await sql`
    insert into public.student_dance_profiles (
      person_id, style_term_id, role_term_id, level_term_id, is_primary, active
    ) values (
      ${student.person_id}::bigint, 1, 5, 7, true, true
    )
    on conflict (person_id, style_term_id, role_term_id) do update
    set level_term_id = excluded.level_term_id,
        is_primary = true,
        active = true,
        updated_at = now()
  `;

  const iphone = await createProjectFixture(
    sql,
    runId,
    'iphone-large-chromium',
    55,
    -20,
    teacher.user_id,
    student.person_id,
  );
  const desktop = await createProjectFixture(
    sql,
    runId,
    'desktop-chromium',
    65,
    -10,
    teacher.user_id,
    student.person_id,
  );

  return {
    studentName: student.display_name,
    style: 'Bachata',
    role: 'Leader',
    level: 'Inicio',
    projects: {
      'iphone-large-chromium': iphone,
      'desktop-chromium': desktop,
    },
  };
}
