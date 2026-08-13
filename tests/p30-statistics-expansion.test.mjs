import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const business=readFileSync("db/migrations/v70f1_p30_business_filter_alignment.sql","utf8");
const marketing=readFileSync("db/migrations/v70f2_p30_marketing_extended_metrics.sql","utf8");
const catalog=readFileSync("db/migrations/v70f3_p30_statistics_catalog_expansion.sql","utf8");
const extended=readFileSync("db/migrations/v70f4_p30_teaching_operations_expansion.sql","utf8");
const router=readFileSync("db/migrations/v70f5_p30_statistics_card_router_expansion.sql","utf8");

test("P30 business cards honor payment status",()=>{
  assert.match(business,/payment_status/);
  assert.match(business,/paid','pending','refunded/);
  assert.match(business,/cg\.payment_status=v_payment_status/);
});

test("P30 exposes the CyA hub 2 marketing funnel",()=>{
  for(const key of ["marketing_impressions","marketing_reach","marketing_clicks","marketing_inquiries","marketing_ctr","marketing_inquiry_rate","marketing_booking_rate","marketing_roi"]){
    assert.match(catalog,new RegExp(key));
    assert.match(router,new RegExp(key));
  }
  for(const column of ["impressions","reach","clicks","inquiries","bookings","revenue_cents","spend_cents"]) assert.match(marketing,new RegExp(`mm\\.${column}`));
});

test("P30 exposes additional teaching and operations states",()=>{
  for(const key of ["assignments_created","assignments_pending","missions_not_done","notification_attempts"]){
    assert.match(catalog,new RegExp(key));
    assert.match(router,new RegExp(key));
    assert.match(extended,new RegExp(key));
  }
});
