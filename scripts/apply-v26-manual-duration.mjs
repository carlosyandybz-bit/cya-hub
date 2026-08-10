import fs from "node:fs";

const path = "app/cya-app.tsx";
const source = fs.readFileSync(path, "utf8");
const replacement = fs.readFileSync("scripts/finish-class-modal-v26.txt", "utf8");
const start = source.indexOf("function FinishClassModal(");
const end = source.indexOf("\nfunction LiveSession(", start);
if (start < 0 || end < 0) throw new Error("FinishClassModal block not found");

fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
