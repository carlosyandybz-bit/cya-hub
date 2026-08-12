import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const account = fs.readFileSync('app/account-pages.tsx','utf8');
const media = fs.readFileSync('supabase/v50_p22_student_portal_media_access.sql','utf8');
const mediaInvoker = fs.readFileSync('supabase/v50b_p22_media_invoker_wrapper.sql','utf8');
const visibility = fs.readFileSync('supabase/v38-student-training-visibility.sql','utf8');
const evaluations = fs.readFileSync('supabase/v36b-student-portal-security-invoker.sql','utf8');
const buildInfo = fs.readFileSync('app/api/build-info/route.ts','utf8');

test('P22 exposes an explicit no-store v50-ready runtime marker', () => {
  assert.ok(buildInfo.includes('p22-student-portal-v50-ready'));
  assert.ok(buildInfo.includes('cache-control'));
  assert.ok(buildInfo.includes('no-store'));
});

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

test('student profile reuses the canonical P20 runtime instead of a duplicate form', () => {
  assert.ok(account.includes('import { RuntimeForm } from "./runtime-form"'));
  assert.ok(account.includes('identity.can_study'));
  assert.ok(account.includes('formKey="student_personal"'));
  assert.ok(account.includes('mode="edit"'));
  assert.ok(account.includes('Mis datos de alumno'));
});

test('student training remains release-gated for all four teaching types', () => {
  assert.ok(visibility.includes("p_content_type='correction'"));
  assert.ok(visibility.includes("p_content_type in ('explanation','sequence')"));
  assert.ok(visibility.includes("p_content_type='exercise'"));
  assert.ok(visibility.includes("p_assignment_status in ('active','completed')"));
  assert.ok(visibility.includes('student_visible_at is not null'));
  assert.ok(visibility.includes("t.publication_status='published'"));
  assert.ok(visibility.includes("t.visibility='student'"));
  assert.ok(app.includes('!["corrected", "explained", "completed"].includes(assignment.assignment_status)'));
});

test('student evaluations remain hidden until release and preserve dance context', () => {
  assert.ok(evaluations.includes("s.status='completed'"));
  assert.ok(evaluations.includes('c.pedagogy_closed_at is not null'));
  assert.ok(evaluations.includes("errcode='42501'"));
  for (const key of ["'style_term_id'", "'style'", "'role_term_id'", "'role'", "'level_term_id'", "'level'"]) assert.ok(media.includes(key));
  assert.ok(app.includes('item.style_term_id === latestEvaluation.style_term_id'));
  assert.ok(app.includes('item.role_term_id === latestEvaluation.role_term_id'));
  assert.ok(app.includes('item.level_term_id === latestEvaluation.level_term_id'));
  assert.ok(app.includes('contextEvaluations.slice(0,12)'));
});

test('class history keeps a compact first page but exposes every older class', () => {
  assert.ok(app.includes('snapshot.classes.slice(0, 8).map((item) => <PortalClassRow'));
  assert.ok(app.includes('snapshot.classes.slice(8).map((item) => <PortalClassRow'));
  assert.ok(app.includes('clases anteriores'));
});

test('Drive authorization ends with a public SECURITY INVOKER wrapper and guarded private helper', () => {
  assert.ok(media.includes('private.can_access_student_portal_media'));
  assert.ok(media.includes('security definer'));
  assert.ok(media.includes('private.student_can_read_assignment('));
  assert.ok(mediaInvoker.includes('security invoker'));
  assert.ok(mediaInvoker.includes('grant execute on function private.can_access_student_portal_media(text)'));
  assert.ok(mediaInvoker.includes('revoke all on function private.can_access_student_portal_media(text)'));
  assert.ok(mediaInvoker.includes('revoke all on function public.can_access_teaching_media(text) from public,anon'));
  assert.ok(mediaInvoker.includes('grant execute on function public.can_access_teaching_media(text) to authenticated'));
  assert.equal(mediaInvoker.includes('security definer\nset search_path'), false);
});

test('teaching media requires the same releasable assignment used by the portal', () => {
  assert.ok(media.includes('private.student_can_read_assignment('));
  assert.ok(media.includes('a.student_visible_at'));
  assert.ok(media.includes('a.assignment_status'));
  assert.equal(media.includes('grant select on public.teaching_content_media to authenticated'), false);
  assert.equal(mediaInvoker.includes('grant select on public.teaching_content_media'), false);
});

test('class media and private videos require ownership and pedagogical close', () => {
  assert.ok(media.includes('from public.class_video_resources v'));
  assert.ok(media.includes("v.visibility_scope='private_student'"));
  assert.ok(media.includes('v.person_id=v_person'));
  assert.ok(media.includes('from public.class_media_resources m'));
  assert.ok(media.includes('m.person_id=v_person'));
  assert.ok((media.match(/c\.pedagogy_closed_at is not null/g) ?? []).length >= 3);
});

test('staff can still access all supported portal media families', () => {
  const staffBlock = media.slice(media.indexOf('if (select private.is_staff())'), media.indexOf("if not (select private.has_app_role('student'))"));
  assert.ok(staffBlock.includes('public.teaching_content_media'));
  assert.ok(staffBlock.includes('public.class_video_resources'));
  assert.ok(staffBlock.includes('public.class_media_resources'));
});
