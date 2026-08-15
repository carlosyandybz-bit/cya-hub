import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notifications=readFileSync("app/notifications-view.tsx","utf8");

test("notification clusters include the concrete source entity",()=>{
  assert.match(notifications,/function entityKey\(item: EnrichedNotification\)/);
  assert.match(notifications,/mission\?\.source_domain && mission\.source_id/);
  assert.match(notifications,/mission:\$\{entity\}:\$\{item\.mission\.rule_key\}:\$\{target\}/);
  assert.doesNotMatch(notifications,/mission:\$\{item\.mission\.rule_key\}:\$\{target\}/);
});

test("group labels preserve the concrete title for duplicate notices of one entity",()=>{
  assert.match(notifications,/const titles = new Set\(cluster\.items\.map\(\(item\) => item\.title\)\)/);
  assert.match(notifications,/if \(titles\.size === 1\) return cluster\.representative\.title/);
});

test("current production rule aliases have product labels",()=>{
  assert.match(notifications,/"classes\.preparation_needed": "Clases que necesitan preparación"/);
  assert.match(notifications,/"bonuses\.low_or_expiring": "Bonos que necesitan revisión"/);
  assert.match(notifications,/source === "credit_grant"\) return "Bono"/);
});

test("notification copy remains entity-aware and audience-specific",()=>{
  assert.match(notifications,/audience === "student" \? "Tus avisos" : "Avisos de trabajo"/);
  assert.match(notifications,/sin mezclar asuntos distintos/);
  assert.match(notifications,/únicamente novedades y acciones relacionadas con tu propia experiencia/);
});
