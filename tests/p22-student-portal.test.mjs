import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const media = fs.readFileSync('supabase/v50_p22_student_portal_media_access.sql','utf8');
const visibility = fs.readFileSync('supabase/v38-student-training-visibility.sql','utf8');
const evaluations = fs.readFileSync('supabase/v36b-student-portal-security-invoker.sql','utf8');

test('student portal keeps the complete product areas wired', () => {
  for (const copy of [
    'Próxima clase',
    'Mi formación',
    'Vídeos de mis clases',
    'Resumen de mis clases',
    'Observaciones de mis clases',
    'Trabajo de mis clases',
    'Documentación de clase',
    'Mi evolución',
    'Mis clases',
    'Mis bonos',
  ]) assert.ok(app.includes(copy), `missing portal area: ${copy}`);
  assert.ok(app.includes('student_portal_snapshot'));
  assert.ok(app.includes('experience === "student" && identity.can_study'));
});

test('student training remains release-gated for all four teaching types', () => {
  assert.ok(visibility.includes("p_content_type='correction'"));
  assert.ok(visibility.includes("p_content_type in ('explanation','sequence')"));
  assert.ok(visibility.includes("p_content_type='exercise'"));
  assert.ok(visibility.includes("p_assignment_status in ('active','completed')"));
  assert.ok(visibility.includes('student_visible_at is not null'));
  assert.ok(visibility.includes("t.publication_status='published'"));
  assert.ok(visibility.includes("t.visibility='student'"));
});

test('student evaluations remain hidden until their release conditions are met', () => {
  assert.ok(evaluations.includes("s.status='completed'"));
  assert.ok(evaluations.includes('c.pedagogy_closed_at is not null'));
  assert.ok(evaluations.includes("errcode='42501'"));
});

test('Drive ticket authorization uses an explicit private security boundary', () => {
  assert.ok(media.includes('private.can_access_student_portal_media'));
  assert.ok(media.includes('security definer'));
  assert.ok(media.includes('security invoker'));
  assert.ok(media.includes('revoke all on function private.can_access_student_portal_media(text)'));
  assert.ok(media.includes('grant execute on function public.can_access_teaching_media(text) to authenticated'));
});

test('teaching media requires the same releasable assignment used by the portal', () => {
  assert.ok(media.includes('private.student_can_read_assignment('));
  assert.ok(media.includes('a.student_visible_at'));
  assert.ok(media.includes('a.assignment_status'));
  assert.equal(media.includes('grant select on public.teaching_content_media to authenticated'), false);
});

test('class media and private videos require ownership and pedagogical close', () => {
  assert.ok(media.includes('from public.class_video_resources v'));
  assert.ok(media.includes("v.visibility_scope='private_student'"));
  assert.ok(media.includes('v.person_id=v_person'));
  assert.ok(media.includes('from public.class_media_resources m'));
  assert.ok(media.includes('m.person_id=v_person'));
  assert.ok((media.match(/c\.pedagogy_closed_at is not null/g) ?? []).length >= 2);
});

test('staff can still access all supported portal media families', () => {
  const staffBlock = media.slice(media.indexOf('if (select private.is_staff())'), media.indexOf("if not (select private.has_app_role('student'))"));
  assert.ok(staffBlock.includes('public.teaching_content_media'));
  assert.ok(staffBlock.includes('public.class_video_resources'));
  assert.ok(staffBlock.includes('public.class_media_resources'));
});
