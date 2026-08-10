import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function tsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [full] : [];
  });
}

const files = tsxFiles("app");
const sources = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
const all = [...sources.values()].join("\n");
const cya = fs.readFileSync("app/cya-app.tsx", "utf8");
const admin = fs.readFileSync("app/admin-view.tsx", "utf8");
const marketing = fs.readFileSync("app/marketing-view-legacy.tsx", "utf8");

test("application does not use browser number steppers for editable numeric fields", () => {
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /type="number"/, `${file} still contains type=number`);
  }
});

test("integer fields request the numeric keyboard and money fields request decimal keyboard", () => {
  const tags = all.match(/<input\b[^>]*>/g) ?? [];
  const integerNames = new Set(["hours", "minutes", "capacity", "impressions", "reach", "clicks", "inquiries", "bookings"]);
  const decimalNames = new Set(["price", "budget", "spend", "revenue", "quoted_amount"]);
  for (const tag of tags) {
    const name = tag.match(/name="([^"]+)"/)?.[1];
    if (name && integerNames.has(name)) assert.match(tag, /inputMode="numeric"/, `${name} must request numeric keyboard: ${tag}`);
    if (name && decimalNames.has(name)) assert.match(tag, /inputMode="decimal"/, `${name} must request decimal keyboard: ${tag}`);
  }
  assert.match(admin, /inputMode="numeric"/);
  assert.match(cya, /inputMode="decimal"/);
});

test("class duration fields are natural text values with no forced zero minutes", () => {
  assert.match(cya, /integerFieldValue/);
  assert.match(cya, /name="hours" type="text" inputMode="numeric"/);
  assert.match(cya, /name="minutes" type="text" inputMode="numeric"/);
  assert.match(cya, /name="minutes" type="text" inputMode="numeric" pattern="\[0-5\]\?\[0-9\]" defaultValue=""/);
  assert.match(cya, /decimalFieldValue\(form\.get\("price"\)\)/);
});

test("decimal inputs accept Spanish comma and validation happens at save time", () => {
  assert.match(marketing, /raw\.replace\(",", "\."\)/);
  assert.match(marketing, /decimalFormNumber\(form\.get\("quoted_amount"\)\)/);
  assert.match(marketing, /decimalFormNumber\(f\.get\("spend"\)\)/);
  assert.match(marketing, /decimalFormNumber\(f\.get\("revenue"\)\)/);
  assert.match(marketing, /minutes>59/);
  assert.match(admin, /boundedInteger/);
  assert.match(admin, /Indica un número entre 1 y 50/);
});

test("evaluation discrete controls remain intact while numeric text fields are normalized", () => {
  assert.match(cya, /\[0,25,50,75,100\]/);
  assert.match(cya, /score-grid/);
});
