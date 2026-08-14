import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected fragment is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patch(path, replacements) {
  let source = readFileSync(path, "utf8");
  for (const [before, after, label] of replacements) source = replaceOnce(source, before, after, `${path} · ${label}`);
  writeFileSync(path, source);
}

patch("app/admin-data-reset.tsx", [
  [
    "Auth, acceso administrativo, roles, migraciones, catálogos base, configuración e integraciones quedan protegidos para que CYA Hub siga arrancando.",
    "Tu acceso, los roles, catálogos base, configuración e integraciones se conservan para que CYA Hub siga funcionando.",
    "protected data explanation",
  ],
  [
    "Se ejecutará ahora el borrado de «{preview.target_label || preview.preview.scope_label}». Si una operación interna falla, PostgreSQL revierte la transacción completa.",
    "Se borrará ahora «{preview.target_label || preview.preview.scope_label}». Si algo falla durante el proceso, no se aplicará ningún cambio parcial.",
    "transaction explanation",
  ],
]);

patch("app/admin-data-transfer.tsx", [
  [
    "Restauración no destructiva: actualiza/recupera registros sin borrar filas adicionales.",
    "La restauración recupera los datos incluidos sin borrar información adicional.",
    "restore explanation",
  ],
  [
    "Faltan {missingAuth.length} usuarios de acceso en Supabase Auth; la restauración está bloqueada.",
    "Faltan {missingAuth.length} cuentas de acceso necesarias; la restauración está bloqueada.",
    "missing account explanation",
  ],
]);

patch("app/admin-form-library.tsx", [
  ["Crear motor genérico versionado", "Crear formulario configurable", "create form card"],
  ["Motor P20 preparado para despliegue", "Edición avanzada no disponible", "pending heading"],
  [
    "La biblioteca se muestra en modo lectura hasta que v48 esté activa. Las fichas de alumnado siguen usando el guardado seguro anterior durante esta transición.",
    "La biblioteca se muestra temporalmente en modo lectura. Las fichas de alumnado siguen funcionando con normalidad.",
    "pending detail",
  ],
  ["Contrato histórico de un flujo de negocio", "Configurado desde su módulo", "domain heading"],
  [
    "Este elemento pertenece a bonos, vinculación, renovación u otra operación transaccional. Se conserva para trazabilidad, pero no se ejecuta como formulario JSON genérico.",
    "Este formulario pertenece a una operación específica y se gestiona desde su sección correspondiente.",
    "domain detail",
  ],
]);

patch("app/admin-view.tsx", [
  ["<p className=\"eyebrow\">Motor</p><h2>Misiones automáticas</h2>", "<p className=\"eyebrow\">Automatización</p><h2>Misiones automáticas</h2>", "missions eyebrow"],
  ["label=\"Activar motor de misiones\"", "label=\"Activar misiones automáticas\"", "missions switch label"],
]);

patch("app/p27-notifications-admin.tsx", [
  ["Comprobando el motor de notificaciones…", "Comprobando notificaciones…", "loading"],
  ["P27 · MOTOR AUTOMÁTICO", "NOTIFICACIONES AUTOMÁTICAS", "eyebrow"],
  ["Motor de notificaciones", "Notificaciones", "title"],
  [
    "La bandeja interna funciona de forma automática. Un canal externo solo se habilita cuando su conexión y su dispatcher están verificados.",
    "La bandeja interna funciona automáticamente. Email y WhatsApp solo se habilitan cuando su conexión está lista para enviar.",
    "intro",
  ],
  [
    "Los avisos se registran de forma idempotente, se resuelven cuando deja de existir la acción pendiente y cada miembro del equipo ve únicamente su propia bandeja.",
    "Cada aviso aparece una sola vez por acción pendiente y desaparece cuando deja de requerir atención. Cada miembro del equipo ve únicamente su propia bandeja.",
    "internal behavior",
  ],
  ["Salud del motor", "Estado de entregas", "delivery health"],
  ["Conexión y dispatcher verificados.", "Conexión lista para enviar.", "ready external channel"],
  [
    "P27 no generará un falso envío por este canal mientras no exista una integración real.",
    "Este canal permanecerá desactivado hasta que exista una conexión lista para enviar.",
    "inactive external channel",
  ],
]);

patch("app/p31-appearance-admin.tsx", [
  [
    "Configuración global segura, sin CSS arbitrario ni binarios almacenados en Postgres.",
    "Configura la identidad visual común de CYA Hub de forma segura y consistente.",
    "appearance intro",
  ],
]);

patch("app/p31-integrations-admin.tsx", [
  ["Sin API verificada", "Sin automatización", "whatsapp badge"],
  ["Sin API verificada", "Sin automatización", "email badge"],
  [
    "Acceso real confirmado. Carpeta de enseñanza: ${drive.folderName}.",
    "Acceso confirmado. Carpeta de enseñanza: ${drive.folderName}.",
    "drive verified",
  ],
  [
    "Hay configuración de servidor, pero Google todavía no ha confirmado el acceso.",
    "La conexión está configurada, pero Google todavía no ha confirmado el acceso.",
    "drive pending",
  ],
  [
    "El servidor todavía no dispone de una configuración completa de Drive.",
    "Google Drive todavía no está configurado.",
    "drive unconfigured",
  ],
  [
    "Los binarios permanecen en Drive; CYA conserva referencias y organización.",
    "Los archivos permanecen en Drive; CYA conserva sus referencias y organización.",
    "drive storage explanation",
  ],
  [
    "CYA puede preparar el mensaje y abrir WhatsApp para el envío manual. No se presenta como envío automático mientras no exista dispatcher/API verificado.",
    "CYA puede preparar el mensaje y abrir WhatsApp para el envío manual. El envío automático seguirá desactivado hasta que haya una conexión compatible.",
    "whatsapp explanation",
  ],
  [
    "CYA puede preparar el correo y abrir el cliente del usuario. No se marca como conectado mientras no exista un proveedor de envío comprobado.",
    "CYA puede preparar el correo y abrir tu aplicación de email. El envío automático seguirá desactivado hasta que haya una conexión compatible.",
    "email explanation",
  ],
  ["<span className=\"badge\">No integrada</span>", "<span className=\"badge\">No conectada</span>", "meta badge"],
  [
    "Instagram y Facebook siguen disponibles como canales de planificación de Marketing. Una conexión API de Meta solo se mostrará aquí cuando exista y pueda verificarse.",
    "Instagram y Facebook siguen disponibles para planificar contenido. La publicación automática se activará solo cuando exista una conexión compatible y verificada.",
    "meta explanation",
  ],
]);

patch("app/statistics-explorer.tsx", [
  ["El mismo catálogo y motor que utiliza tu panel principal.", "Consulta aquí todas las métricas disponibles en tu panel.", "statistics intro"],
]);

patch("app/google-calendar-server.ts", [
  ["Supabase respondió ${response.status}.", "El servicio de calendario respondió ${response.status}.", "calendar service error"],
]);

patch("app/google-drive-server.ts", [
  ["Supabase RPC ${name} falló.", "No se pudo completar la operación de Google Drive.", "drive service error"],
]);

writeFileSync("tests/product-copy.test.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst read=(path)=>readFileSync(path,"utf8");\nconst notifications=read("app/p27-notifications-admin.tsx");\nconst forms=read("app/admin-form-library.tsx");\nconst reset=read("app/admin-data-reset.tsx");\nconst transfer=read("app/admin-data-transfer.tsx");\nconst appearance=read("app/p31-appearance-admin.tsx");\nconst integrations=read("app/p31-integrations-admin.tsx");\nconst statistics=read("app/statistics-explorer.tsx");\nconst calendarServer=read("app/google-calendar-server.ts");\nconst driveServer=read("app/google-drive-server.ts");\n\ntest("final notification copy does not expose implementation jargon",()=>{\n  for(const token of ["P27 · MOTOR AUTOMÁTICO","Motor de notificaciones","idempotente","dispatcher"]) assert.ok(!notifications.includes(token),token);\n  assert.match(notifications,/NOTIFICACIONES AUTOMÁTICAS/);\n  assert.match(notifications,/Cada aviso aparece una sola vez por acción pendiente/);\n});\n\ntest("administration copy explains behavior instead of deployment internals",()=>{\n  for(const token of ["Motor P20 preparado para despliegue","formulario JSON genérico","PostgreSQL revierte","Supabase Auth","CSS arbitrario","binarios almacenados en Postgres"]) {\n    assert.ok(!forms.includes(token) && !reset.includes(token) && !transfer.includes(token) && !appearance.includes(token),token);\n  }\n  assert.match(forms,/Edición avanzada no disponible/);\n  assert.match(reset,/no se aplicará ningún cambio parcial/);\n});\n\ntest("integration and statistics surfaces use product language",()=>{\n  for(const token of ["Sin API verificada","dispatcher\\/API","conexión API de Meta","Los binarios permanecen","catálogo y motor"]) {\n    assert.ok(!integrations.includes(token) && !statistics.includes(token),token);\n  }\n  assert.match(integrations,/Sin automatización/);\n  assert.match(statistics,/Consulta aquí todas las métricas disponibles/);\n});\n\ntest("server errors that may reach UI do not expose Supabase internals",()=>{\n  assert.doesNotMatch(calendarServer,/Supabase respondió/);\n  assert.doesNotMatch(driveServer,/Supabase RPC/);\n});\n`);

console.log("Product copy cleanup applied exactly once.");
