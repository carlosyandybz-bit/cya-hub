import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema=readFileSync("db/migrations/v70a_p30_statistics_dashboard_schema.sql","utf8");
const preferences=readFileSync("db/migrations/v70d_p30_statistics_preferences.sql","utf8");
const assignments=readFileSync("db/migrations/v70e1_p30_statistics_assignments_table.sql","utf8");
const assignmentAccess=readFileSync("db/migrations/v70e2_p30_statistics_assignments_access.sql","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");
const engine=readFileSync("app/statistics-engine.ts","utf8");
const engineCore=readFileSync("app/statistics-engine-core.ts","utf8");
const dashboardData=readFileSync("app/statistics-dashboard-data.ts","utf8");
const admin=readFileSync("app/admin-statistics.tsx","utf8");
const configurable=readFileSync("app/statistics-configurable-view.tsx","utf8");
const explorer=readFileSync("app/statistics-explorer.tsx","utf8");
const contract=readFileSync("docs/P30_ESTADISTICAS_CONFIGURABLES.md","utf8");

test("dashboards are declarative and RLS governed",()=>{
  for(const token of ["statistics_dashboards","statistics_dashboard_cards","metric_key text not null","filters jsonb","enable row level security"]) assert.match(schema,new RegExp(token));
  assert.doesNotMatch(schema,/sql text|query text|expression text/i);
  assert.match(schema,/private\.is_staff\(\)/);
  assert.match(schema,/private\.is_admin\(\)/);
});

test("global assigned and personal dashboard resolution is explicit",()=>{
  assert.match(schema,/global','teacher','personal/);
  assert.match(assignments,/active boolean/);
  assert.match(assignmentAccess,/statistics_dashboard_assignments_self_read/);
  for(const token of ['firstDashboard(client,"personal",userId)','statistics_dashboard_assignments','.eq("active",true)','firstDashboard(client,"teacher",userId)','firstDashboard(client,"global")']) assert.ok(dashboardData.includes(token),token);
});

test("periods are configurable",()=>{
  for(const value of ["today","this_week","this_month","this_year","rolling_days","custom"]) assert.match(engineCore,new RegExp(value));
  assert.match(preferences,/quick_periods/);
  assert.match(admin,/Periodos rápidos/);
  assert.match(admin,/Intervalo personalizado/);
});

test("catalog is complete and does not fake student city",()=>{
  for(const block of ["classes","students","business","teaching","marketing","operations"]) assert.match(catalog,new RegExp(`${block}:`));
  for(const key of ["marketing_impressions","marketing_reach","marketing_clicks","marketing_inquiries","marketing_ctr","marketing_booking_rate","marketing_roi","class_location","location_scope"]) assert.match(catalog,new RegExp(key));
  assert.doesNotMatch(catalog,/student_city/);
  assert.match(configurable,/localidad del alumno se añadirá cuando exista ese dato canónico/);
  for(const future of ["BZ Points","Feedback Online","Academia Online"]) assert.match(contract,new RegExp(future));
});

test("direct engine uses explicit Supabase sources and no RPC or dynamic SQL",()=>{
  for(const table of ["classes","class_participants","student_profiles","credit_grants","student_content_assignments","student_evaluations","marketing_campaign_metrics","missions","notification_deliveries"]) assert.ok(engine.includes(`from(\"${table}\")`),table);
  assert.doesNotMatch(engine,/\.rpc\(/);
  assert.doesNotMatch(engine,/\bexecute\b/i);
  assert.doesNotMatch(engine,/\.or\(/);
  assert.match(engine,/Métrica no soportada/);
});

test("Administration exposes real filters and reversible teacher assignment",()=>{
  assert.match(admin,/statisticCatalog/);
  assert.doesNotMatch(admin,/statistics_metric_catalog/);
  for(const label of ["Profesor","Alumno","Estilo","Campaña","Ubicación","Estado de clase","País","Pago","Contenido","Tipo de misión","Prioridad","Canal","Tipo de aviso","Preferente","Todos los profesores","El profesor principal pertenece al panel","Asignación retirada"]) assert.match(admin,new RegExp(label));
});

test("dashboard and explorer share one calculation engine",()=>{
  assert.match(configurable,/calculateStatistic/);
  assert.match(explorer,/calculateStatistic/);
  assert.doesNotMatch(configurable,/\.rpc\(/);
  assert.doesNotMatch(explorer,/\.rpc\(/);
  assert.match(explorer,/statisticCatalog/);
});
