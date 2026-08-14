import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app=readFileSync("app/cya-app.tsx","utf8");
const marketing=readFileSync("app/marketing-view-legacy.tsx","utf8");
const student=readFileSync("app/student-detail.tsx","utf8");
const country=readFileSync("app/country-field.tsx","utf8");

test("student and CRM creation use the canonical country selector",()=>{
  assert.match(app,/import \{ CountrySelect \} from "\.\/country-field"/);
  assert.match(app,/function AddStudent[\s\S]*<CountrySelect name="country_code" value=\{country\} onChange=\{setCountry\}/);
  assert.doesNotMatch(app,/name="country_code" maxLength=\{2\} placeholder="ES"/);
  assert.match(marketing,/import \{ CountrySelect \} from "\.\/country-field"/);
  assert.match(marketing,/function ContactEditor[\s\S]*<CountrySelect name="country_code" value=\{country\} onChange=\{setCountry\}/);
  assert.doesNotMatch(marketing,/name="country_code" maxLength=\{2\} placeholder="ES"/);
});

test("country storage remains ISO while presentation uses Spanish names",()=>{
  assert.match(app,/p_country_code: String\(form\.get\("country_code"\)/);
  assert.match(marketing,/p_country_code: String\(form\.get\("country_code"\)/);
  assert.match(student,/countryName\(student\.country_code\)/);
  assert.match(country,/new Intl\.DisplayNames\(\["es"\], \{ type: "region" \}\)/);
  assert.match(country,/value=\{normalized\}/);
});
