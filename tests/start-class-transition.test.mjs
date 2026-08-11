import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');

test('starting a class refreshes operational state before optional teaching refresh',()=>{
  assert.match(app,/const refreshLive = useCallback\(async \(\) => \{\s*await loadOperations\(\);/s);
  assert.match(app,/try \{ await loadTeaching\(\); \}\s*catch \(error\)/s);
  assert.doesNotMatch(app,/Promise\.all\(\[loadOperations\(\),loadTeaching\(\),loadMarketing\(\)\]\)/);
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
