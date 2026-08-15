import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("AUD-020 additive layer stays semantic and preserves reduced-motion handling", async () => {
  const css = read("app/aud020-student-experience.css");
  expect(css).toContain('nav[aria-label="Portal CYA"]');
  expect(css).toContain('[role="dialog"][aria-labelledby="student-master-title"]');
  expect(css).toContain('section[aria-labelledby="portal-now-title"]');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).not.toContain("display:none!important;/*hide-data*/");
});

test("AUD-020 layout loads after prior audit layers", async () => {
  const layout = read("app/layout.tsx");
  const regression = layout.indexOf('import "./aud017-regression-fixes.css";');
  const aud020 = layout.indexOf('import "./aud020-student-experience.css";');
  expect(regression).toBeGreaterThanOrEqual(0);
  expect(aud020).toBeGreaterThan(regression);
});

test("AUD-020 teacher goal navigation remains four-area and human", async () => {
  const navigation = read("app/student-detail-navigation.tsx");
  for (const label of ["Ahora", "Aprendizaje", "Historial", "Perfil"]) expect(navigation).toContain(`label: "${label}"`);
  for (const copy of ["Prioridad y contexto", "Formación y progreso", "Clases y saldo", "Datos y gestión"]) expect(navigation).toContain(copy);
});
