import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected fragment is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(path, transform) {
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  writeFileSync(path, after);
}

update("app/cya-app.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { QuickProvisionalStudentModal, type EditablePersonIdentity } from "./person-identity-editor";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
    'import { QuickProvisionalStudentModal, type EditablePersonIdentity } from "./person-identity-editor";\nimport { CountrySelect } from "./country-field";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
    "cya-app country import",
  );
  source = replaceOnce(
    source,
    'function AddStudent({ close, created }: { close: () => void; created: () => Promise<void> }) {\n  const [busy, setBusy] = useState(false), [error, setError] = useState("");',
    'function AddStudent({ close, created }: { close: () => void; created: () => Promise<void> }) {\n  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [country, setCountry] = useState("");',
    "AddStudent country state",
  );
  source = replaceOnce(
    source,
    '<label className="field"><span>País</span><input name="country_code" maxLength={2} placeholder="ES" /></label>',
    '<label className="field"><span>País</span><CountrySelect name="country_code" value={country} onChange={setCountry} /></label>',
    "AddStudent country selector",
  );
  return source;
});

update("app/marketing-view-legacy.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { FormEvent, useMemo, useState } from "react";\n',
    'import { FormEvent, useMemo, useState } from "react";\nimport { CountrySelect } from "./country-field";\n',
    "marketing country import",
  );
  source = replaceOnce(
    source,
    'function ContactEditor({ db, contact, rates, close, saved }: { db: SupabaseClient; contact: CrmContact | null; rates: MarketingRate[]; close: () => void; saved: (message: string) => Promise<void> }) {\n  const profile = contact?.crm_profiles?.[0];\n  const [busy,setBusy] = useState(false), [error,setError] = useState("");',
    'function ContactEditor({ db, contact, rates, close, saved }: { db: SupabaseClient; contact: CrmContact | null; rates: MarketingRate[]; close: () => void; saved: (message: string) => Promise<void> }) {\n  const profile = contact?.crm_profiles?.[0];\n  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [country,setCountry] = useState(contact?.country_code ?? "");',
    "CRM country state",
  );
  source = replaceOnce(
    source,
    '<label className="field"><span>País</span><input name="country_code" maxLength={2} placeholder="ES" defaultValue={contact?.country_code ?? ""} /></label>',
    '<label className="field"><span>País</span><CountrySelect name="country_code" value={country} onChange={setCountry} /></label>',
    "CRM country selector",
  );
  return source;
});

update("app/student-detail.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { StudentIdentityEditor } from "./person-identity-editor";\nimport styles from "./student-detail.module.css";',
    'import { StudentIdentityEditor } from "./person-identity-editor";\nimport { countryName } from "./country-field";\nimport styles from "./student-detail.module.css";',
    "student-detail country import",
  );
  source = replaceOnce(
    source,
    '<div><MapPin /><span>País</span><strong>{student.country_code || "Sin indicar"}</strong></div>',
    '<div><MapPin /><span>País</span><strong>{countryName(student.country_code)}</strong></div>',
    "student-detail country display",
  );
  return source;
});

update("docs/CYA_HUB_POSTRELEASE_BACKLOG.md", (source) => {
  source = replaceOnce(
    source,
    '## Ficha profesional de profesor — PARCIAL\nExiste históricamente `teacher_profile` con Nombre profesional, Teléfono, Biografía, Estilos impartidos y Especialidades, pero está inactivo. Las rutas `teacher_profiles.*` nunca se materializaron y la tabla no existe. Debe reutilizarse el formulario histórico sobre un modelo canónico real y mostrarse en Mi perfil para cualquier profesor.',
    '## Ficha profesional de profesor — COMPLETADO\n`teacher_profiles` es el modelo canónico activo y `Mi perfil` expone el formulario versionado `teacher_profile` para cualquier identidad con rol de profesor. Nombre profesional, biografía, estilos y especialidades se editan sobre la misma persona P19.',
    "backlog teacher profile",
  );
  source = replaceOnce(
    source,
    '## Alta de profesores — PARCIAL\nAdministración solo activa roles a usuarios existentes. Falta un flujo claro y seguro de invitación/alta de profesor sin duplicar identidad.',
    '## Alta de profesores — COMPLETADO\nAdministración dispone de `Añadir profesor`, reutiliza la persona canónica P19, crea o reutiliza Auth de forma segura, activa roles `teacher` + `student` y conserva rollback compensatorio ante una finalización incompleta.',
    "backlog teacher onboarding",
  );
  source = replaceOnce(
    source,
    '## País completo — PARCIAL\nLa BD debe conservar `country_code` ISO. La UI debe dejar de pedir/mostrar solo `ES`, `FR`, etc. y usar selector/nombre completo (`España`, `Francia`...).',
    '## País completo — COMPLETADO\nLa BD conserva `country_code` ISO-2. Altas de alumnado, edición de identidad, CRM, formularios versionados y alta de profesores usan selector completo; las superficies de lectura presentan el nombre del país en español (`España`, `Francia`...) mediante la utilidad común de países.',
    "backlog country complete",
  );
  return source;
});

writeFileSync("tests/country-presentation.test.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst app=readFileSync("app/cya-app.tsx","utf8");\nconst marketing=readFileSync("app/marketing-view-legacy.tsx","utf8");\nconst student=readFileSync("app/student-detail.tsx","utf8");\nconst country=readFileSync("app/country-field.tsx","utf8");\n\ntest("student and CRM creation use the canonical country selector",()=>{\n  assert.match(app,/import \\{ CountrySelect \\} from "\\.\\/country-field"/);\n  assert.match(app,/function AddStudent[\\s\\S]*<CountrySelect name="country_code" value=\\{country\\} onChange=\\{setCountry\\}/);\n  assert.doesNotMatch(app,/name="country_code" maxLength=\\{2\\} placeholder="ES"/);\n  assert.match(marketing,/import \\{ CountrySelect \\} from "\\.\\/country-field"/);\n  assert.match(marketing,/function ContactEditor[\\s\\S]*<CountrySelect name="country_code" value=\\{country\\} onChange=\\{setCountry\\}/);\n  assert.doesNotMatch(marketing,/name="country_code" maxLength=\\{2\\} placeholder="ES"/);\n});\n\ntest("country storage remains ISO while presentation uses Spanish names",()=>{\n  assert.match(app,/p_country_code: String\\(form\\.get\\("country_code"\\)/);\n  assert.match(marketing,/p_country_code: String\\(form\\.get\\("country_code"\\)/);\n  assert.match(student,/countryName\\(student\\.country_code\\)/);\n  assert.match(country,/new Intl\\.DisplayNames\\(\\["es"\\], \\{ type: "region" \\}\\)/);\n  assert.match(country,/value=\\{normalized\\}/);\n});\n`);

console.log("Country presentation patch applied exactly once.");
