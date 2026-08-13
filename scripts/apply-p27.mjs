import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`P27 patch made no change in ${path}`);
  fs.writeFileSync(path, after);
}

patch("app/admin-view.tsx", (source) => {
  let next = source;
  const importNeedle = 'import { GoogleCalendarSync } from "./google-calendar-sync";';
  if (!next.includes('import { P27NotificationsAdmin } from "./p27-notifications-admin";')) {
    if (!next.includes(importNeedle)) throw new Error("admin P27 import anchor missing");
    next = next.replace(importNeedle, `${importNeedle}\nimport { P27NotificationsAdmin } from "./p27-notifications-admin";`);
  }
  const start = next.indexOf("  function notificationsSection() {");
  const end = next.indexOf("\n\n  function dataSection()", start);
  if (start < 0 || end < 0) throw new Error("admin notificationsSection anchors missing");
  next = `${next.slice(0, start)}  function notificationsSection() {\n    return <P27NotificationsAdmin client={client} notify={notify} />;\n  }${next.slice(end)}`;
  return next;
});

patch("app/notifications-view.tsx", (source) => {
  const oldValue = 'const resolvedMissionStates = new Set(["completed", "completed_automatically", "cancelled"]);';
  const newValue = 'const resolvedMissionStates = new Set(["completed", "completed_automatically", "cancelled", "not_done", "not_applicable", "expired"]);';
  if (!source.includes(oldValue)) throw new Error("notification terminal-state anchor missing");
  return source.replace(oldValue, newValue);
});
