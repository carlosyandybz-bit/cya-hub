import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');

test('starting a class refreshes required operational and student state before optional teaching refresh',()=>{
  const start=app.indexOf('const refreshLive = useCallback');
  const end=app.indexOf('const refreshMarketing',start);
  assert.ok(start >= 0 && end > start);
  const body=app.slice(start,end);
  assert.match(body,/await Promise\.all\(\[loadOperations\(\),loadStudents\(\)\]\)/);
  assert.match(body,/try \{ await loadTeaching\(\); \}\s*catch \(error\)/s);
  assert.doesNotMatch(body,/loadMarketing\(\)/);
});

test('class start always releases busy state and surfaces failures',()=>{
  const start=app.indexOf('async function begin()');
  assert.ok(start >= 0);
  const body=app.slice(start,start+1000);
  assert.match(body,/db\.rpc\("start_class",\{p_class_id:item\.id\}\)/);
  assert.match(body,/if \(result\.error\) throw result\.error/);
  assert.match(body,/await refresh\(\)/);
  assert.match(body,/finally \{\s*setBusy\(false\);/s);
  assert.match(body,/setError\(message\)/);
});
