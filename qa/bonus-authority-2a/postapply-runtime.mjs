import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const URL = req('SUPABASE_URL').replace(/\/$/, '');
const KEY = req('SUPABASE_PUBLISHABLE_KEY');
const RUN = req('QA_RUN_ID');
const MAGIC = {
  teacher: req('QA_TEACHER_MAGICLINK_TOKEN'),
  student: req('QA_STUDENT_MAGICLINK_TOKEN'),
  admin: req('QA_ADMIN_MAGICLINK_TOKEN'),
};
const EMAIL = {
  teacher: 'carlosyandybz+staging-profesor@gmail.com',
  student: 'carlosyandybz+staging-alumno@gmail.com',
  admin: 'carlosyandybz+staging-admin@gmail.com',
};
const MARK = `CYA_QA_BONUS_AUTHORITY_2A:${RUN}`;
const results = [];
const durable = [];

function req(n){ const v=process.env[n]; if(!v) throw new Error(`${n} required`); return v; }
function uuid(){ return crypto.randomUUID(); }
function record(n,label,status,detail={}){ const r={n,label,status,...detail}; results.push(r); console.log(JSON.stringify({type:'QA_TEST',...r})); }
async function parse(r){ const t=await r.text(); if(!t) return null; try{return JSON.parse(t)}catch{return t} }
async function verify(email, token){
  const u=new URL(`${URL}/auth/v1/verify`); u.searchParams.set('token',token); u.searchParams.set('type','magiclink');
  const r=await fetch(u,{redirect:'manual',headers:{apikey:KEY}});
  assert.ok([301,302,303,307,308].includes(r.status),`verify ${email} HTTP ${r.status}: ${JSON.stringify(await parse(r))}`);
  const loc=r.headers.get('location'); assert.ok(loc,'missing magiclink redirect');
  const p=new URLSearchParams(new URL(loc,URL).hash.replace(/^#/,'')); const accessToken=p.get('access_token'); assert.ok(accessToken,'missing access token');
  const ur=await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:`Bearer ${accessToken}`}}); const user=await parse(ur);
  assert.ok(ur.ok && user?.id,`resolve user ${email}`); assert.equal(String(user.email).toLowerCase(),email.toLowerCase());
  return {accessToken,user};
}
function hdr(s,extra={}){ return {apikey:KEY,Authorization:`Bearer ${s.accessToken}`,...extra}; }
async function api(path,{session,method='GET',body,headers={}}={}){
  const r=await fetch(`${URL}${path}`,{method,headers:session?hdr(session,headers):{apikey:KEY,...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {response:r,data:await parse(r)};
}
async function rest(table,params={},opts={}){
  const q=new URLSearchParams(params); const headers={}; if(opts.body!==undefined) headers['Content-Type']='application/json'; if(opts.prefer) headers.Prefer=opts.prefer;
  return api(`/rest/v1/${table}${q.toString()?`?${q}`:''}`,{session:opts.session,method:opts.method||'GET',body:opts.body,headers});
}
async function rpc(name,body,session){ return api(`/rest/v1/rpc/${name}`,{session,method:'POST',body,headers:{'Content-Type':'application/json',Prefer:'return=representation'}}); }
function ok(label,c){ assert.ok(c.response.ok,`${label} HTTP ${c.response.status}: ${JSON.stringify(c.data)}`); return c.data; }
function err(label,c,codes){ assert.equal(c.response.ok,false,`${label} unexpectedly succeeded`); assert.ok(codes.includes(c.data?.code),`${label} unexpected ${c.response.status}: ${JSON.stringify(c.data)}`); }
async function rows(table,params,session,select='*'){ const c=await rest(table,{select,...params},{session}); const d=ok(`select ${table}`,c); assert.ok(Array.isArray(d)); return d; }
async function one(table,params,session,select='*'){ const r=await rows(table,params,session,select); assert.equal(r.length,1,`${table} expected 1 got ${r.length}`); return r[0]; }
async function balance(grantId,s){ const ms=await rows('credit_movements',{grant_id:`eq.${grantId}`},s,'delta_minutes'); return ms.reduce((a,x)=>a+Number(x.delta_minutes),0); }
async function movements(grantId,s){ return rows('credit_movements',{grant_id:`eq.${grantId}`,order:'id.asc'},s,'id,grant_id,person_id,class_id,movement_type,delta_minutes,note,reverses_movement_id,provenance,source_operation_key'); }
async function audits(grantId,s){ const rs=await rows('audit_events',{entity_type:'eq.credit_grant',entity_id:`eq.${grantId}`,order:'id.asc'},s,'id,event_type,entity_id,detail,actor_user_id'); return rs; }
function byKey(xs,key){ return xs.filter(x=>x.source_operation_key===key); }
function auditByKey(xs,key,type){ return xs.filter(x=>x.event_type===type && x.detail?.operation_key===key); }
function rpcResult(data){ return Array.isArray(data)?data[0]:data; }
async function consume(s,g,p,c,m,key){ return rpc('consume_credit_grant_for_class',{p_grant_id:g,p_person_id:p,p_class_id:c,p_minutes:m,p_operation_key:key},s); }
async function reverse(s,m,key,reason){ return rpc('reverse_credit_consumption_for_class',{p_original_movement_id:m,p_operation_key:key,p_reason:reason},s); }

async function createFixture(label,minutes,teacher,admin,personId){
  const cls=ok('create class',await rest('classes',{}, {session:teacher,method:'POST',prefer:'return=representation',body:{teacher_user_id:teacher.user.id,class_type:'individual',status:'scheduled',scheduled_start_at:new Date().toISOString(),duration_minutes:60,notes:`${MARK}:${label}:CLASS`,workflow_stage:'data',created_by:teacher.user.id}}));
  const classId=Number(cls[0].id);
  const gs=ok('create grant',await rest('credit_grants',{}, {session:teacher,method:'POST',prefer:'return=representation',body:{modality:'individual',label:`${MARK}:${label}:GRANT`,total_minutes:minutes,price_cents:0,payment_status:'paid',status:'active',purchased_at:new Date().toISOString(),starts_at:new Date(Date.now()-60_000).toISOString(),created_by:teacher.user.id}}));
  const grantId=Number(gs[0].id);
  ok('grant member',await rest('credit_grant_members',{}, {session:teacher,method:'POST',prefer:'return=representation',body:{grant_id:grantId,person_id:personId}}));
  ok('grant movement',await rest('credit_movements',{}, {session:teacher,method:'POST',prefer:'return=representation',body:{grant_id:grantId,person_id:personId,class_id:null,movement_type:'grant',delta_minutes:minutes,note:`${MARK}:${label}:INITIAL`,created_by:teacher.user.id,occurred_at:new Date().toISOString(),date_approximate:false,provenance:{qa:true,marker:MARK},source_operation_key:null}}));
  durable.push({label,grantId,classId});
  assert.equal(await balance(grantId,admin),minutes);
  return {grantId,classId,personId};
}

async function main(){
  const teacher=await verify(EMAIL.teacher,MAGIC.teacher); const student=await verify(EMAIL.student,MAGIC.student); const admin=await verify(EMAIL.admin,MAGIC.admin);
  const people=await rows('people',{auth_user_id:`eq.${student.user.id}`},admin,'id,auth_user_id,display_name'); assert.equal(people.length,1); const personId=Number(people[0].id);

  // 1-4 valid reversal, replay, reason mismatch, double reversal.
  {
    const f=await createFixture('REV',60,teacher,admin,personId); const ck=`${MARK}:REV:C`; const rk=`${MARK}:REV:R`; const reason='QA canonical reversal';
    const c=rpcResult(ok('consume valid',await consume(teacher,f.grantId,personId,f.classId,20,ck))); assert.equal(c.idempotent_replay,false); const originalId=Number(c.movement_id); assert.equal(await balance(f.grantId,admin),40);
    const r1=rpcResult(ok('reverse valid',await reverse(teacher,originalId,rk,reason))); assert.equal(r1.idempotent_replay,false); const reversalId=Number(r1.movement_id); assert.equal(await balance(f.grantId,admin),60);
    let ms=await movements(f.grantId,admin); let as=await audits(f.grantId,admin); const orig=ms.find(x=>Number(x.id)===originalId); const rev=ms.find(x=>Number(x.id)===reversalId);
    assert.equal(Number(orig.delta_minutes),-20); assert.equal(Number(rev.delta_minutes),20); assert.equal(Number(rev.reverses_movement_id),originalId); assert.equal(rev.note,reason); assert.equal(rev.provenance?.reason,reason); assert.equal(auditByKey(as,rk,'credit_consumption_reversed_canonical').length,1);
    record(1,'valid reversal','PASS',{grantId,originalId,reversalId});
    const r2=rpcResult(ok('reverse replay',await reverse(teacher,originalId,rk,reason))); assert.equal(Number(r2.movement_id),reversalId); assert.equal(r2.idempotent_replay,true); ms=await movements(f.grantId,admin); as=await audits(f.grantId,admin); assert.equal(byKey(ms,rk).length,1); assert.equal(auditByKey(as,rk,'credit_consumption_reversed_canonical').length,1); assert.equal(await balance(f.grantId,admin),60); record(2,'same-key same-payload replay','PASS');
    const beforeM=ms.length,beforeA=as.length; const bad=await reverse(teacher,originalId,rk,'DIFFERENT REASON'); err('reason mismatch',bad,['23505']); ms=await movements(f.grantId,admin); as=await audits(f.grantId,admin); assert.equal(ms.length,beforeM); assert.equal(as.length,beforeA); assert.equal(await balance(f.grantId,admin),60); record(3,'same-key different reason fail-closed','PASS');
    const dbl=await reverse(teacher,originalId,`${MARK}:REV:DOUBLE`,'second reversal'); err('double reversal',dbl,['22023']); assert.equal((await movements(f.grantId,admin)).length,beforeM); assert.equal(await balance(f.grantId,admin),60); record(4,'double reversal fail-closed','PASS');
  }

  // 5 exhausted -> active.
  {
    const f=await createFixture('EXHAUST',30,teacher,admin,personId); const c=rpcResult(ok('consume exhaust',await consume(teacher,f.grantId,personId,f.classId,30,`${MARK}:EX:C`))); assert.equal(c.grant_status,'exhausted'); assert.equal(await balance(f.grantId,admin),0); let g=await one('credit_grants',{id:`eq.${f.grantId}`},admin,'id,status,payment_status'); assert.equal(g.status,'exhausted');
    const r=rpcResult(ok('reverse exhausted',await reverse(teacher,Number(c.movement_id),`${MARK}:EX:R`,'restore exhausted'))); assert.equal(r.grant_status,'active'); assert.equal(await balance(f.grantId,admin),30); g=await one('credit_grants',{id:`eq.${f.grantId}`},admin,'id,status,payment_status'); assert.equal(g.status,'active'); record(5,'exhausted to active','PASS');
  }

  // 6 concurrent reversal same key.
  {
    const f=await createFixture('CONCURRENT_REV',60,teacher,admin,personId); const c=rpcResult(ok('consume before concurrent reverse',await consume(teacher,f.grantId,personId,f.classId,30,`${MARK}:CR:C`))); const key=`${MARK}:CR:R`; const reason='concurrent reverse';
    const calls=await Promise.all(Array.from({length:8},()=>reverse(teacher,Number(c.movement_id),key,reason))); calls.forEach((x,i)=>ok(`concurrent reverse ${i}`,x)); const ids=calls.map(x=>Number(rpcResult(x.data).movement_id)); assert.equal(new Set(ids).size,1); const ms=await movements(f.grantId,admin); const as=await audits(f.grantId,admin); assert.equal(byKey(ms,key).length,1); assert.equal(auditByKey(as,key,'credit_consumption_reversed_canonical').length,1); assert.equal(await balance(f.grantId,admin),60); record(6,'concurrent reversal same-key','PASS',{callers:8,movementId:ids[0]});
  }

  // 7 concurrent consumption: same key, overspend with distinct keys, incompatible same key.
  {
    const f=await createFixture('CONCURRENT_CONSUME',60,teacher,admin,personId); const key=`${MARK}:CC:SAME`; const calls=await Promise.all(Array.from({length:8},()=>consume(teacher,f.grantId,personId,f.classId,30,key))); calls.forEach((x,i)=>ok(`same-key consume ${i}`,x)); const ids=calls.map(x=>Number(rpcResult(x.data).movement_id)); assert.equal(new Set(ids).size,1); assert.equal(byKey(await movements(f.grantId,admin),key).length,1); assert.equal(await balance(f.grantId,admin),30);
    const f2=await createFixture('OVERSPEND',60,teacher,admin,personId); const pair=await Promise.all([consume(teacher,f2.grantId,personId,f2.classId,45,`${MARK}:OS:A`),consume(teacher,f2.grantId,personId,f2.classId,45,`${MARK}:OS:B`)]); assert.equal(pair.filter(x=>x.response.ok).length,1); assert.equal(pair.filter(x=>x.data?.code==='22023').length,1); assert.equal(await balance(f2.grantId,admin),15); assert.equal((await movements(f2.grantId,admin)).filter(x=>x.movement_type==='class').length,1);
    const f3=await createFixture('INCOMPAT_CONCURRENT',60,teacher,admin,personId); const ik=`${MARK}:IC:KEY`; const inc=await Promise.all([consume(teacher,f3.grantId,personId,f3.classId,20,ik),consume(teacher,f3.grantId,personId,f3.classId,30,ik)]); assert.equal(inc.filter(x=>x.response.ok).length,1); assert.equal(inc.filter(x=>x.data?.code==='23505').length,1); assert.equal(byKey(await movements(f3.grantId,admin),ik).length,1); const b=await balance(f3.grantId,admin); assert.ok(b===40||b===30); record(7,'concurrent consumption / overspend / incompatible-key','PASS',{sameKeyCallers:8});
  }

  // 8 lost response + retry real for consume and reverse.
  {
    const f=await createFixture('LOST_RESPONSE',60,teacher,admin,personId); const ck=`${MARK}:LR:C`; const consumePath='/rest/v1/rpc/consume_credit_grant_for_class';
    const first=await fetch(`${URL}${consumePath}`,{method:'POST',headers:hdr(teacher,{'Content-Type':'application/json',Prefer:'return=representation'}),body:JSON.stringify({p_grant_id:f.grantId,p_person_id:personId,p_class_id:f.classId,p_minutes:20,p_operation_key:ck})}); assert.ok(first.ok); /* response body intentionally discarded after commit-visible headers */
    const retry=rpcResult(ok('lost consume retry',await consume(teacher,f.grantId,personId,f.classId,20,ck))); assert.equal(retry.idempotent_replay,true); const cm=byKey(await movements(f.grantId,admin),ck); assert.equal(cm.length,1); const orig=Number(cm[0].id); assert.equal(await balance(f.grantId,admin),40);
    const rk=`${MARK}:LR:R`; const reversePath='/rest/v1/rpc/reverse_credit_consumption_for_class'; const rr=await fetch(`${URL}${reversePath}`,{method:'POST',headers:hdr(teacher,{'Content-Type':'application/json',Prefer:'return=representation'}),body:JSON.stringify({p_original_movement_id:orig,p_operation_key:rk,p_reason:'lost reverse'})}); assert.ok(rr.ok); const rretry=rpcResult(ok('lost reverse retry',await reverse(teacher,orig,rk,'lost reverse'))); assert.equal(rretry.idempotent_replay,true); assert.equal(byKey(await movements(f.grantId,admin),rk).length,1); assert.equal(await balance(f.grantId,admin),60); record(8,'lost-response retry consume/reverse','PASS');
  }

  // 9 atomicity on invalid operations.
  {
    const f=await createFixture('ATOMIC',60,teacher,admin,personId); const beforeM=(await movements(f.grantId,admin)).length; const beforeA=(await audits(f.grantId,admin)).length; const bad=await consume(teacher,f.grantId,personId,f.classId,100,`${MARK}:ATOMIC:BAD`); err('insufficient consume',bad,['22023']); assert.equal((await movements(f.grantId,admin)).length,beforeM); assert.equal((await audits(f.grantId,admin)).length,beforeA); assert.equal(await balance(f.grantId,admin),60);
    const c=rpcResult(ok('atomic seed consume',await consume(teacher,f.grantId,personId,f.classId,20,`${MARK}:ATOMIC:C`))); const beforeR=(await movements(f.grantId,admin)).length; const empty=await reverse(teacher,Number(c.movement_id),`${MARK}:ATOMIC:R`,'   '); err('empty reason',empty,['22023']); assert.equal((await movements(f.grantId,admin)).length,beforeR); assert.equal(await balance(f.grantId,admin),40); record(9,'atomicity invalid operations','PASS');
  }

  // Terminal cancelled/refunded cannot reactivate.
  {
    const f=await createFixture('TERMINAL',30,teacher,admin,personId); const c=rpcResult(ok('terminal seed consume',await consume(teacher,f.grantId,personId,f.classId,10,`${MARK}:TERM:C`))); ok('refund total',await rpc('refund_credit_grant_total',{p_grant_id:f.grantId,p_reason:'QA terminal'},teacher)); const g=await one('credit_grants',{id:`eq.${f.grantId}`},admin,'id,status,payment_status'); assert.equal(g.status,'cancelled'); assert.equal(g.payment_status,'refunded'); const before=(await movements(f.grantId,admin)).length; const r=await reverse(teacher,Number(c.movement_id),`${MARK}:TERM:R`,'should deny'); err('terminal reverse',r,['22023']); assert.equal((await movements(f.grantId,admin)).length,before); assert.equal(await balance(f.grantId,admin),0); record(10,'terminal refund/cancel no reactivation','PASS');
  }

  console.log(JSON.stringify({type:'QA_SUMMARY',status:'PASS',tests:results.length,durableFixtures:durable,marker:MARK}));
}

main().catch(e=>{ console.error(JSON.stringify({type:'QA_FATAL',message:e?.message,stack:e?.stack})); process.exit(1); });
