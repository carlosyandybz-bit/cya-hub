import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema=readFileSync("db/migrations/v70a_p30_statistics_dashboard_schema.sql","utf8");
const preferences=readFileSync("db/migrations/v70d_p30_statistics_preferences.sql","utf8");
const assignments=readFileSync("db/migrations/v70e_p30_statistics_assignments.sql","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");
const engine=readFileSync("app/statistics-engine.ts","utf8");
const dashboardData=readFileSync("app/statistics-dashboard-data.ts","utf8");
const admin=readFileSync("app/admin-statistics.tsx","utf8");
const configurable=readFileSync("app/statistics-configurable-view.tsx","utf8");
const explorer=readFileSync("app/statistics-explorer.tsx","utf8");
const contract=readFileSync("docs/P30_ESTADISTICAS_CONFIGURABLES.md","utf8");

test("P30 dashboards stay declarative and RLS governed",()=>{
  assert.match(schema,/statistics_dashboards/);
  assert.match(schema,/statistics_dashboard_cards/);
  assert.match(schema,/metric_key text not null/);
  assert.match(schema,/filters jsonb/);
  assert.doesNotMatch(schema,/sql text|query text|expression text/i);
  assert.match(schema,/enable row level security/i);
  assert.match(schema,/private\.is_staff\(\)/);
  assert.match(schema,/private\.is_admin\(\)/);
});

test("P30 supports global assigned and personal dashboards",()=>{
  assert.match(schema,/global','teacher','personal/);
  assert.match(assignments,/statistics_dashboard_assignments/);
  assert.match(assignments,/active boolean/);
  assert.match(dashboardData,/firstDashboard\(client,"personal",userId\)/);
  assert.match(dashboardData,/statistics_dashboard_assignments/);
  assert.match(dashboardData,/firstDashboard\(client,"teacher",userId\)/);
  assert.match(dashboardData,/firstDashboard\(client,"global"\)/);
});

test("P30 periods go beyond the old fixed explorer",()=>{
  for(const value of ["today","this_week","this_month","this_year","rolling_days","custom"]) assert.match(catalog,new RegExp(value));
  assert.match(preferences,/quick_periods/);
  assert.match(admin,/Periodos rápidos/);
  assert.match(admin,/Intervalo personalizado/);
});

test("P30 catalog exposes all business blocks and no fake student city",()=>{
  for(const block of ["classes","students","business","teaching","marketing","operations"]) assert.match(catalog,new RegExp(`${block}:`));
  for(const key of ["marketing_impressions","marketing_reach","marketing_clicks","marketing_inquiries","marketing_ctr","marketing_booking_rate","marketing_roi"]) assert.match(catalog,new RegExp(key));
  assert.match(catalog,/class_location/);
  assert.match(catalog,/location_scope/);
  assert.doesNotMatch(catalog,/student_city/);
  assert.match(configurable,/localidad del alumno se añadirá cuando exista ese dato canónico/);
  assert.match(contract,/BZ Points/);
  assert.match(contract,/Feedback Online/);
  assert.match(contract,/Academia Online/);
});

test("P30 direct engine uses explicit Supabase sources and no RPC or dynamic SQL",()=>{
  for(const table of ["classes","class_participants","student_profiles","credit_grants","student_content_assignments","student_evaluations","marketing_campaign_metrics","missions","notification_deliveries"]) assert.match(engine,new RegExp(`from\\(\\"${table}\\"\\)`));
  assert.doesNotMatch(engine,/\.rpc\(/);
  assert.doesNotMatch(engine,/\bexecute\b/i);
  assert.doesNotMatch(engine,/\.or\(/);
  assert.match(engine,/Métrica no soportada/);
});

test("P30 Administration uses the same typed catalog and real filter controls",()=>{
  assert.match(admin,/statisticCatalog/);
  assert.doesNotMatch(admin,/statistics_metric_catalog/);
  for(const label of ["Profesor","Alumno","Estilo","Campaña","Ubicación","Estado de clase","País","Pago","Contenido","Tipo de misión","Prioridad","Canal","Tipo de aviso"]) assert.match(admin,new RegExp(label));
  assert.match(admin,/Preferente/);
  assert.match(admin,/Profesores que usarán este panel/);
  assert.match(admin,/Todos los profesores/);
});

test("P30 dashboard and explorer share one calculation engine",()=>{
  assert.match(configurable,/calculateStatistic/);
  assert.match(explorer,/calculateStatistic/);
  assert.doesNotMatch(configurable,/\.rpc\(/);
  assert.doesNotMatch(explorer,/\.rpc\(/);
  assert.match(explorer,/statisticCatalog/);
});
