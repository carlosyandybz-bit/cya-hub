import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../db/migrations/v87_aud010a_fk_indexes.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');

const expectedIndexes = [
  'academy_programs_role_term_id_idx',
  'academy_programs_level_term_id_idx',
  'bz_action_events_class_id_idx',
  'bz_action_events_content_id_idx',
  'bz_reward_redemptions_reward_id_idx',
  'class_close_grant_artifacts_grant_id_idx',
  'class_content_events_content_id_idx',
  'class_financial_items_person_id_idx',
  'class_media_resources_person_id_idx',
  'class_participants_preferred_billing_grant_id_idx',
  'class_preparation_requests_content_id_idx',
  'evaluation_sessions_style_term_id_idx',
  'evaluation_sessions_role_term_id_idx',
  'evaluation_sessions_level_term_id_idx',
  'feedback_credit_orders_product_id_idx',
  'feedback_request_contents_content_id_idx',
  'feedback_requests_product_id_idx',
  'feedback_requests_style_term_id_idx',
  'feedback_requests_role_term_id_idx',
  'feedback_requests_level_term_id_idx',
  'feedback_requests_assigned_teacher_user_id_idx',
  'feedback_requests_evaluation_session_id_idx',
];

test('AUD-010A only adds the targeted FK indexes', () => {
  for (const indexName of expectedIndexes) {
    assert.match(migration, new RegExp(`create index if not exists ${indexName}\\b`, 'i'));
  }

  const createIndexCount = (migration.match(/create index if not exists/gi) ?? []).length;
  assert.equal(createIndexCount, expectedIndexes.length);
});

test('AUD-010A remains non-destructive and does not change authorization semantics', () => {
  assert.doesNotMatch(migration, /\bdrop\s+index\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+policy\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+policy\b/i);
  assert.doesNotMatch(migration, /\bgrant\b/i);
  assert.doesNotMatch(migration, /\brevoke\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
});

test('AUD-010A does not re-open the already-resolved duplicate sequence index cleanup', () => {
  assert.doesNotMatch(migration, /teaching_content_relations_sequence_position_(?:uidx|uniq)/i);
  assert.match(migration, /does not remove any existing\/unused index/i);
});
