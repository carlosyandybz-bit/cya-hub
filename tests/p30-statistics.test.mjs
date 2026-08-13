import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base=readFileSync("db/migrations/v69_p30_teacher_statistics.sql","utf8");
const schema=readFileSync("db/migrations/v70a_p30_statistics_dashboard_schema.sql","utf8");
const catalog=readFileSync("db/migrations/v70b_p30_statistics_catalog.sql","utf8");
const periods=readFileSync("db/migrations/v70c1_p30_statistics_periods.sql","utf8");
const classMetrics=readFileSync("db/migrations/v70c2_p30_statistics_class_metrics.sql","utf8");
const people=readFileSync("db/migrations/v70c3_p30_statistics_people_business_metrics.sql","utf8");
const teaching=readFileSync("db/migrations/v70c4_p30_statistics_teaching_marketing_metrics.sql","utf8");
const operations=readFileSync("db/migrations/v70c5_p30_statistics_operations_metrics.sql","utf8");
const cardApi=readFileSync("db/migrations/v70c6_p30_statistics_card_value.sql","utf8");
const preferences=readFileSync("db/migrations/v70d_p30_statistics_preferences.sql","utf8");
const assignments=readFileSync("db/migrations/v70e_p30_statistics_assignments.sql","utf8");
const admin=readFileSync("app/admin-statistics.tsx","utf8");
const configurable=readFileSync("app/statistics-configurable-view.tsx","utf8");
const contract=readFileSync("docs/P30_ESTADISTICAS_CONFIGURABLES.md","utf8");

function withoutPrivilegeExecute(sql){
  return sql
    .replace(/\bgrant\s+execute\s+on\s+function\b/gi,"grant on function")
    .replace(/\brevoke\s+(?:all|execute)\s+on\s+function\b/gi,"revoke on function");
}

test("P30 global statistics are readable by any teacher, never by students",()=>{
  assert.match(base,/private\.is_staff\(\)/); assert.doesNotMatch(base,/private\.is_admin\(\)/);
  assert.match(cardApi,/private\.is_staff\(\)/); assert.match(cardApi,/revoke all[\s\S]*public,anon/);
});

test("P30 dashboards are declarative and admin-governed",()=>{
  assert.match(schema,/statistics_dashboards/); assert.match(schema,/statistics_dashboard_cards/);
  assert.match(schema,/metric_key text not null/); assert.match(schema,/filters jsonb/);
  assert.doesNotMatch(schema,/sql text|query text|expression text/i);
  assert.match(schema,/private\.is_admin\(\)/);
});

test("P30 supports global, teacher assigned and personal dashboards",()=>{
  assert.match(schema,/global','teacher','personal/); assert.match(assignments,/statistics_dashboard_assignments/);
  assert.match(assignments,/a\.user_id=v_user/); assert.match(preferences,/scope='personal'.*auth\.uid/s);
});

test("P30 periods are configurable beyond the old 30 90 365 explorer",()=>{
  for(const value of ["today","this_week","this_month","this_year","rolling_days","custom"]) assert.match(periods,new RegExp(value));
  assert.match(preferences,/quick_periods/); assert.match(admin,/Periodos rápidos/);
});

test("P30 card catalog is grouped and extensible",()=>{
  for(const block of ["classes","students","business","teaching","marketing","operations"]) assert.match(catalog,new RegExp(`'block','${block}'`));
  assert.match(contract,/BZ Points/); assert.match(contract,/Feedback Online/); assert.match(contract,/Academia Online/);
});

test("P30 can calculate classes inside or outside a real class location",()=>{
  assert.match(catalog,/class_location/); assert.match(catalog,/location_scope/);
  assert.match(classMetrics,/location_text/); assert.match(classMetrics,/v_scope='outside'/);
  assert.match(admin,/Fuera de esta ubicación/);
});

test("P30 does not pretend student city exists before there is a canonical field",()=>{
  assert.doesNotMatch(catalog,/'student_city'|'city'/);
  assert.match(configurable,/localidad del alumno se añadirá cuando exista ese dato canónico/);
});

test("P30 safe executor has explicit metric branches and no dynamic execute",()=>{
  for(const fn of [classMetrics,people,teaching,operations,cardApi]) assert.doesNotMatch(withoutPrivilegeExecute(fn),/\bexecute\b/i);
  assert.match(cardApi,/Métrica no soportada/);
});

test("P30 legacy snapshot uses only canonical campaign metric columns",()=>{
  assert.match(base,/mm\.spend_cents/); assert.match(base,/mm\.revenue_cents/); assert.match(base,/mm\.bookings/);
  assert.doesNotMatch(base,/mm\.inquiries|mm\.clicks/);
  assert.doesNotMatch(teaching,/mm\.inquiries|mm\.clicks/);
});

test("P30 Administration controls availability preferred metrics and teacher assignments",()=>{
  assert.match(preferences,/statistics_metric_settings/); assert.match(preferences,/featured/);
  assert.match(admin,/Preferente/); assert.match(admin,/Profesores que usarán este panel/); assert.match(admin,/Todos los profesores/);
});
