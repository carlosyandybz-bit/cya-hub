import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const sql = fs.readFileSync("supabase/v27-compatible-credit-selection.sql", "utf8");
const sql30 = fs.readFileSync("supabase/v30-point8-final-close.sql", "utf8");

test("active compatible credit is selected by earliest expiry and remains manually changeable", () => {
  assert.match(app, /compatibleCreditsForClass/);
  assert.match(app, /grant\.modality !== item\.class_type/);
  assert.match(app, /expires_at/);
  assert.match(app, /safeA - safeB/);
  assert.match(app, /defaultGrantSelection\(item, credits\)/);
  assert.match(app, /<select value=\{grantIds\[participant\.person_id\]/);
  assert.match(app, /Bono de pareja/);
});

test("finish flow offers quick bonus, regularization and atomic single-class payment", () => {
  assert.match(app, /Crear bono rápido/);
  assert.match(app, /Pagar clase suelta/);
  assert.match(app, /Regularizar \{minutesLabel\(row\.shortfall\)\} ahora/);
  assert.match(app, /create_credit_grant/);
  assert.match(app, /administratively_finish_class_v6/);
  assert.match(app, /p_direct_payment_price_cents/);
  assert.match(app, /p_regularizations/);
});

test("backend rejects incompatible grants and creates direct payment inside the finish transaction", () => {
  assert.match(sql, /v_grant_modality<>v_class\.class_type/);
  assert.match(sql, /expires_at is null or expires_at>now\(\)/);
  assert.match(sql, /v_grant_people is distinct from v_class_people/);
  assert.match(sql, /un único bono de pareja/);
  assert.match(sql, /public\.create_credit_grant/);
  assert.match(sql, /'Clase suelta','paid'/);
  assert.match(sql, /administratively_finish_class_v2/);
  assert.match(sql30, /administratively_finish_class_v4/);
});
