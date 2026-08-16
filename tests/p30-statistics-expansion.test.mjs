import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const engine=readFileSync("app/statistics-engine.ts","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");

test("P30 business cards honor payment status",()=>{
  assert.match(engine,/textFilter\(filters,"payment_status"\)\?\?"paid"/);
  assert.match(engine,/\["paid","pending","refunded"\]\.includes\(payment\)/);
  assert.match(engine,/\.eq\("payment_status",payment\)/);
});

test("P30 exposes the CyA hub 2 marketing funnel",()=>{
  for(const key of ["marketing_impressions","marketing_reach","marketing_clicks","marketing_inquiries","marketing_ctr","marketing_inquiry_rate","marketing_booking_rate","marketing_roi"]){
    assert.match(catalog,new RegExp(key));
    assert.match(engine,new RegExp(key));
  }
  for(const column of ["impressions","reach","clicks","inquiries","bookings","revenue_cents","spend_cents"]) assert.match(engine,new RegExp(column));
});

test("P30 exposes additional teaching and operations states",()=>{
  for(const key of ["assignments_created","assignments_pending","missions_not_done","notification_attempts"]){
    assert.match(catalog,new RegExp(key));
  }
  assert.match(engine,/metricKey==="assignments_created"\|\|metricKey==="assignments_completed"\|\|metricKey==="assignments_pending"/);
  assert.match(engine,/metricKey\.startsWith\("missions_"\)/);
  assert.match(engine,/metricKey\.startsWith\("notification"\)/);
});
