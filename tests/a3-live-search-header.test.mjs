import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isLiveSearchActive } from "../app/live-search-state.ts";

const [app, css] = await Promise.all([
  readFile(new URL("../app/cya-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/p36-live-class.css", import.meta.url), "utf8"),
]);
const liveStart = app.indexOf("function LiveSession(");
const liveEnd = app.indexOf("\nfunction LiveClassView(", liveStart);
const live = app.slice(liveStart, liveEnd);

test("resting live search keeps the four content tabs available", () => {
  assert.equal(isLiveSearchActive({ focused: false, query: "", loading: false, resultCount: 0 }), false);
  assert.match(live, /!searchActive \? <nav className="live-search-kinds p0f-content-tabs">/);
  for (const label of ["Correcciones", "Explicaciones", "Ejercicios", "Secuencias"]) {
    assert.match(live, new RegExp(`'${label}'`));
  }
});

test("input focus activates the search header and hides tabs", () => {
  assert.equal(isLiveSearchActive({ focused: true, query: "", loading: false, resultCount: 0 }), true);
  assert.match(live, /onFocus=\{\(\) => setSearchFocused\(true\)\}/);
  assert.match(live, /onBlur=\{\(\) => setSearchFocused\(false\)\}/);
});

test("a non-empty query keeps tabs hidden after input blur", () => {
  assert.equal(isLiveSearchActive({ focused: false, query: " giro ", loading: false, resultCount: 0 }), true);
  assert.match(live, /query:search/);
});

test("the canonical search remains global and can keep mixed results open", () => {
  assert.equal(isLiveSearchActive({ focused: false, query: "", loading: true, resultCount: 0 }), true);
  assert.equal(isLiveSearchActive({ focused: false, query: "", loading: false, resultCount: 2 }), true);
  assert.match(live, /search_class_teaching_content/);
  assert.match(live, /p_content_type:null/);
  assert.match(live, /const type=result\.content_type/);
  assert.match(live, /teachingKindLabels\[type\]/);
});

test("leaving an empty settled search restores the tabs", () => {
  assert.equal(isLiveSearchActive({ focused: false, query: "   ", loading: false, resultCount: 0 }), false);
  assert.match(live, /!searchActive \? <nav[\s\S]*?<\/nav> : null/);
});

test("leaving search preserves the prior content filter", () => {
  const focusHandler = live.match(/onFocus=\{[\s\S]*?onChange=/)?.[0] ?? "";
  assert.doesNotMatch(focusHandler, /setContentFilter/);
  assert.match(live, /className=\{contentFilter===value\?'active':''\}/);
});

test("hidden tabs are unmounted with no sticky gap at the requested mobile widths", () => {
  const mobileWidths = [320, 360, 375, 390, 393, 402, 414, 430];
  assert.ok(mobileWidths.every((width) => width <= 760));
  assert.match(live, /!searchActive \? <nav[\s\S]*?<\/nav> : null/);
  assert.doesNotMatch(live, /visibility:\s*hidden|opacity:\s*0/);
  assert.match(css, /\.p0f-sticky-search\{top:0;z-index:24/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
});
