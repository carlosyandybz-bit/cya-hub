import fs from "node:fs";

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing pattern: ${label}`);
  return text.replace(from, to);
}

const menuPath = "app/account-menu.tsx";
let menu = fs.readFileSync(menuPath, "utf8");
menu = replaceRequired(
  menu,
  'import { useEffect, useMemo, useRef, useState } from "react";\n',
  'import { useEffect, useMemo, useRef, useState } from "react";\nimport { createPortal } from "react-dom";\n',
  "react-dom portal import",
);
menu = replaceRequired(
  menu,
  '      {accountOpen ? (\n',
  '      {accountOpen && typeof document !== "undefined" ? createPortal(\n',
  "account modal portal start",
);
menu = replaceRequired(
  menu,
  '        </div>\n      ) : null}\n    </div>\n  );\n}\n',
  '        </div>,\n        document.body,\n      ) : null}\n    </div>\n  );\n}\n',
  "account modal portal end",
);
menu = replaceRequired(
  menu,
  '              <p className={styles.accountNote}>Cambiar de portal modifica únicamente la vista. Tus permisos reales se mantienen.</p>',
  '              <p className={styles.accountNote}>Tus permisos se mantienen al cambiar de portal.</p>',
  "account explanatory copy",
);
fs.writeFileSync(menuPath, menu);

const pagesPath = "app/account-pages.tsx";
let pages = fs.readFileSync(pagesPath, "utf8");
pages = replaceRequired(
  pages,
  '<p>Tu identidad visible en CYA Hub. Aquí puedes ampliar más datos del perfil cuando los incorporemos.</p>',
  '<p>Gestiona tu nombre y tu foto de perfil.</p>',
  "profile implementation copy",
);
pages = replaceRequired(
  pages,
  '<span>Elige una foto desde el iPhone. CYA la optimiza antes de subirla.</span>',
  '<span>Elige una foto desde el iPhone.</span>',
  "avatar implementation copy",
);
pages = replaceRequired(
  pages,
  '<p>Configuración personal de CYA Hub. Esta pantalla podrá crecer por secciones sin convertir el avatar en un menú interminable.</p>',
  '<p>Ajusta tu zona horaria y los saludos de Inicio.</p>',
  "preferences implementation copy",
);
pages = replaceRequired(
  pages,
  '<div className={styles.portalSummary}><UserRound /><div><strong>Portal preferido actual</strong><span>{experience === "admin" ? "Administrador" : experience === "student" ? "Alumno" : "Profesor"}. Se actualiza al cambiar de portal desde el avatar.</span></div></div>',
  '<div className={styles.portalSummary}><UserRound /><div><strong>Portal preferido actual</strong><span>{experience === "admin" ? "Administrador" : experience === "student" ? "Alumno" : "Profesor"}</span></div></div>',
  "preferred portal implementation copy",
);
fs.writeFileSync(pagesPath, pages);

const notificationsPath = "app/notifications-view.tsx";
let notifications = fs.readFileSync(notificationsPath, "utf8");
notifications = replaceRequired(
  notifications,
  '<div><p>NOTIFICACIONES</p><h1>Centro de avisos</h1><span>Solo aparecen aquí los avisos de CYA. Inicio queda libre para tu trabajo del día.</span></div>',
  '<div><p>NOTIFICACIONES</p><h1>Centro de avisos</h1><span>Tus avisos pendientes y el historial reciente.</span></div>',
  "notifications implementation copy",
);
fs.writeFileSync(notificationsPath, notifications);
