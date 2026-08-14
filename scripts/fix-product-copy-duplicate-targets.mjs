import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-product-copy.mjs";
let source = readFileSync(path, "utf8");
const before = `  ["Sin API verificada", "Sin automatización", "whatsapp badge"],\n  ["Sin API verificada", "Sin automatización", "email badge"],`;
const after = `  ["<div className=\\"card-head\\"><MessageCircle /><span className=\\"badge\\">Sin API verificada</span></div>", "<div className=\\"card-head\\"><MessageCircle /><span className=\\"badge\\">Sin automatización</span></div>", "whatsapp badge"],\n  ["<div className=\\"card-head\\"><Mail /><span className=\\"badge\\">Sin API verificada</span></div>", "<div className=\\"card-head\\"><Mail /><span className=\\"badge\\">Sin automatización</span></div>", "email badge"],`;
if (!source.includes(before)) throw new Error("Duplicate integration targets were not found exactly once.");
source = source.replace(before, after);
writeFileSync(path, source);
console.log("Integration copy targets disambiguated.");
