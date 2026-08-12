import fs from 'node:fs';
const path='app/admin-view.tsx';
let source=fs.readFileSync(path,'utf8');
const importMarker='import { P0fEvaluationAdmin } from "./p0f-evaluation-admin";';
if(!source.includes('AdminDailyQuotes')){
  if(!source.includes(importMarker)) throw new Error('P24 admin import marker missing');
  source=source.replace(importMarker, `${importMarker}\nimport { AdminDailyQuotes } from "./admin-daily-quotes";`);
}
const endMarker='    </div>;\n  }\n\n  function teamSection() {';
if(!source.includes('<AdminDailyQuotes')){
  if(!source.includes(endMarker)) throw new Error('P24 general section marker missing');
  source=source.replace(endMarker, '      <AdminDailyQuotes client={client} notify={notify} />\n    </div>;\n  }\n\n  function teamSection() {');
}
if(!source.includes('import { AdminDailyQuotes }')||!source.includes('<AdminDailyQuotes client={client} notify={notify} />')) throw new Error('P24 admin integration incomplete');
fs.writeFileSync(path,source);
console.log('P24 admin integration applied');
