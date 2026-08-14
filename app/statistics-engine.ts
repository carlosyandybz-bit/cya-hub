import type { SupabaseClient } from "@supabase/supabase-js";
import { statisticCatalogByKey, type StatisticFilterKey } from "./statistics-catalog";

export type StatisticPeriodKind = "today" | "this_week" | "this_month" | "this_year" | "rolling_days" | "custom";
export type StatisticPeriod = { kind: StatisticPeriodKind; days?: number | null; from?: string | null; to?: string | null };
export type StatisticFilters = Partial<Record<StatisticFilterKey, string | number | null>> & Record<string, unknown>;
export type StatisticValue = { metric_key:string; value:number|null; from:string; to:string; filters:StatisticFilters };

type PeriodBounds = { from:Date; to:Date; fromIso:string; toIso:string; fromDate:string; toDate:string };
type PageResult<T> = { data:T[] | null; error:{ message:string } | null };

const PAGE_SIZE=1000;

function localDateKey(value:Date){
  const year=value.getFullYear();
  const month=String(value.getMonth()+1).padStart(2,"0");
  const day=String(value.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

export function statisticPeriodBounds(period:StatisticPeriod,now=new Date()):PeriodBounds{
  const to=period.kind==="custom"&&period.to?new Date(period.to):new Date(now);
  if(Number.isNaN(to.getTime()))throw new Error("Fin de periodo no válido.");
  let from=new Date(to);
  if(period.kind==="today")from.setHours(0,0,0,0);
  else if(period.kind==="this_week"){
    from.setHours(0,0,0,0);
    from.setDate(from.getDate()-((from.getDay()+6)%7));
  }else if(period.kind==="this_month"){
    from=new Date(to.getFullYear(),to.getMonth(),1);
  }else if(period.kind==="this_year"){
    from=new Date(to.getFullYear(),0,1);
  }else if(period.kind==="rolling_days"){
    const days=Number(period.days??0);
    if(!Number.isInteger(days)||days<1||days>3650)throw new Error("Periodo de días no válido.");
    from=new Date(to.getTime()-days*86_400_000);
  }else if(period.kind==="custom"){
    if(!period.from)throw new Error("Inicio de periodo no válido.");
    from=new Date(period.from);
    if(Number.isNaN(from.getTime())||from>=to||to.getTime()-from.getTime()>10*366*86_400_000)throw new Error("Intervalo personalizado no válido.");
  }else throw new Error("Tipo de periodo no válido.");
  return {from,to,fromIso:from.toISOString(),toIso:to.toISOString(),fromDate:localDateKey(from),toDate:localDateKey(to)};
}

async function collectPages<T>(fetchPage:(from:number,to:number)=>Promise<PageResult<T>>){
  const rows:T[]=[];
  for(let page=0;;page+=1){
    const from=page*PAGE_SIZE,to=from+PAGE_SIZE-1;
    const result=await fetchPage(from,to);
    if(result.error)throw new Error(result.error.message);
    const batch=result.data??[];
    rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
  }
  return rows;
}

function textFilter(filters:StatisticFilters,key:StatisticFilterKey){
  const value=filters[key];
  if(value==null)return null;
  const clean=String(value).trim();
  return clean||null;
}
function numberFilter(filters:StatisticFilters,key:StatisticFilterKey){
  const clean=textFilter(filters,key);
  if(clean==null)return null;
  const value=Number(clean);
  if(!Number.isSafeInteger(value)||value<1)throw new Error(`Filtro ${key} no válido.`);
  return value;
}
function locationMatches(location:string|null,needle:string|null,scope:string|null){
  if(!needle)return true;
  const match=(location??"").toLocaleLowerCase("es-ES").includes(needle.toLocaleLowerCase("es-ES"));
  return scope==="outside"?!match:match;
}
function relationOne<T>(value:T|T[]|null|undefined){return Array.isArray(value)?(value[0]??null):(value??null);}
function inBounds(value:string|null|undefined,bounds:PeriodBounds){if(!value)return false;const time=new Date(value).getTime();return time>=bounds.from.getTime()&&time<bounds.to.getTime();}
async function exactCount(query:PromiseLike<{count:number|null;error:{message:string}|null}>){const result=await query;if(result.error)throw new Error(result.error.message);return result.count??0;}

async function classRows(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters){
  const student=numberFilter(filters,"student"),teacher=textFilter(filters,"teacher"),style=numberFilter(filters,"style"),status=textFilter(filters,"class_status"),location=textFilter(filters,"class_location"),scope=textFilter(filters,"location_scope");
  if(scope&&scope!=="inside"&&scope!=="outside")throw new Error("Ámbito de ubicación no válido.");
  type DirectRow={id:number;actual_duration_minutes:number|null;duration_minutes:number;location_text:string|null};
  type ParticipantRow={class_id:number;classes:DirectRow|DirectRow[]|null};
  if(student){
    const rows=await collectPages<ParticipantRow>(async(from,to)=>{
      let query=client.from("class_participants").select("class_id,classes!class_participants_class_id_fkey!inner(id,actual_duration_minutes,duration_minutes,location_text)").eq("person_id",student).gte("classes.scheduled_start_at",bounds.fromIso).lt("classes.scheduled_start_at",bounds.toIso);
      if(teacher)query=query.eq("classes.teacher_user_id",teacher);
      if(style)query=query.eq("classes.style_term_id",style);
      if(status)query=query.eq("classes.status",status);
      const result=await query.range(from,to);
      return {data:(result.data??[]) as ParticipantRow[],error:result.error};
    });
    return rows.map((row)=>relationOne(row.classes)).filter((row):row is DirectRow=>Boolean(row)).filter((row)=>locationMatches(row.location_text,location,scope));
  }
  const rows=await collectPages<DirectRow>(async(from,to)=>{
    let query=client.from("classes").select("id,actual_duration_minutes,duration_minutes,location_text").gte("scheduled_start_at",bounds.fromIso).lt("scheduled_start_at",bounds.toIso);
    if(teacher)query=query.eq("teacher_user_id",teacher);
    if(style)query=query.eq("style_term_id",style);
    if(status)query=query.eq("status",status);
    const result=await query.range(from,to);
    return {data:(result.data??[]) as DirectRow[],error:result.error};
  });
  return rows.filter((row)=>locationMatches(row.location_text,location,scope));
}

async function attendanceRate(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters){
  const student=numberFilter(filters,"student"),teacher=textFilter(filters,"teacher"),style=numberFilter(filters,"style"),location=textFilter(filters,"class_location"),scope=textFilter(filters,"location_scope");
  type ClassRef={location_text:string|null};
  type Row={attendance_status:string;classes:ClassRef|ClassRef[]|null};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("class_participants").select("attendance_status,classes!class_participants_class_id_fkey!inner(location_text)").gte("classes.scheduled_start_at",bounds.fromIso).lt("classes.scheduled_start_at",bounds.toIso).in("attendance_status",["present","absent"]);
    if(student)query=query.eq("person_id",student);
    if(teacher)query=query.eq("classes.teacher_user_id",teacher);
    if(style)query=query.eq("classes.style_term_id",style);
    const result=await query.range(from,to);
    return {data:(result.data??[]) as Row[],error:result.error};
  });
  const filtered=rows.filter((row)=>locationMatches(relationOne(row.classes)?.location_text??null,location,scope));
  if(!filtered.length)return null;
  return Math.round(filtered.filter((row)=>row.attendance_status==="present").length*1000/filtered.length)/10;
}

async function studentCount(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,isNew:boolean){
  const country=textFilter(filters,"country")?.toUpperCase()??null;
  let query=client.from("student_profiles").select("person_id,people!student_profiles_person_id_fkey!inner(country_code)",{count:"exact",head:true});
  if(isNew)query=query.gte("student_since",bounds.fromDate).lte("student_since",bounds.toDate);else query=query.eq("active",true);
  if(country)query=query.eq("people.country_code",country);
  return exactCount(query);
}

async function grantMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,sumPrice:boolean){
  const student=numberFilter(filters,"student"),payment=textFilter(filters,"payment_status")??"paid";
  if(!["paid","pending","refunded"].includes(payment))throw new Error("Estado de pago no válido.");
  type GrantRow={price_cents:number};
  type MemberRow={credit_grants:GrantRow|GrantRow[]|null};
  if(student){
    if(!sumPrice){
      let query=client.from("credit_grant_members").select("grant_id,credit_grants!credit_grant_members_grant_id_fkey!inner(id)",{count:"exact",head:true}).eq("person_id",student).eq("credit_grants.payment_status",payment).gte("credit_grants.purchased_at",bounds.fromIso).lt("credit_grants.purchased_at",bounds.toIso);
      return exactCount(query);
    }
    const rows=await collectPages<MemberRow>(async(from,to)=>{
      const result=await client.from("credit_grant_members").select("credit_grants!credit_grant_members_grant_id_fkey!inner(price_cents)").eq("person_id",student).eq("credit_grants.payment_status",payment).gte("credit_grants.purchased_at",bounds.fromIso).lt("credit_grants.purchased_at",bounds.toIso).range(from,to);
      return {data:(result.data??[]) as MemberRow[],error:result.error};
    });
    return rows.reduce((sum,row)=>sum+(relationOne(row.credit_grants)?.price_cents??0),0);
  }
  if(!sumPrice){
    const query=client.from("credit_grants").select("id",{count:"exact",head:true}).eq("payment_status",payment).gte("purchased_at",bounds.fromIso).lt("purchased_at",bounds.toIso);
    return exactCount(query);
  }
  const rows=await collectPages<GrantRow>(async(from,to)=>{
    const result=await client.from("credit_grants").select("price_cents").eq("payment_status",payment).gte("purchased_at",bounds.fromIso).lt("purchased_at",bounds.toIso).range(from,to);
    return {data:(result.data??[]) as GrantRow[],error:result.error};
  });
  return rows.reduce((sum,row)=>sum+row.price_cents,0);
}

async function assignmentCount(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,mode:"created"|"completed"|"pending"){
  const student=numberFilter(filters,"student"),style=numberFilter(filters,"style"),contentType=textFilter(filters,"content_type");
  if(contentType&&!['correction','explanation','exercise','sequence'].includes(contentType))throw new Error("Tipo de contenido no válido.");
  const dateColumn=mode==="completed"?"completed_at":"assigned_at";
  let query=client.from("student_content_assignments").select("id,teaching_contents!student_content_assignments_content_id_fkey!inner(content_type)",{count:"exact",head:true}).gte(dateColumn,bounds.fromIso).lt(dateColumn,bounds.toIso);
  if(mode==="pending")query=query.in("assignment_status",["pending","in_correction","active"]);
  if(student)query=query.eq("person_id",student);
  if(style)query=query.eq("snapshot_style_term_id",style);
  if(contentType)query=query.eq("teaching_contents.content_type",contentType);
  return exactCount(query);
}

async function evaluationMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,average:boolean){
  const teacher=textFilter(filters,"teacher"),student=numberFilter(filters,"student"),style=numberFilter(filters,"style");
  if(!average){
    let query=client.from("student_evaluations").select("id",{count:"exact",head:true}).gte("created_at",bounds.fromIso).lt("created_at",bounds.toIso);
    if(teacher)query=query.eq("evaluated_by",teacher);if(student)query=query.eq("person_id",student);if(style)query=query.eq("style_term_id",style);
    return exactCount(query);
  }
  type Row={score:number};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("student_evaluations").select("score").gte("created_at",bounds.fromIso).lt("created_at",bounds.toIso);
    if(teacher)query=query.eq("evaluated_by",teacher);if(student)query=query.eq("person_id",student);if(style)query=query.eq("style_term_id",style);
    const result=await query.range(from,to);return {data:(result.data??[]) as Row[],error:result.error};
  });
  return rows.length?Math.round(rows.reduce((sum,row)=>sum+row.score,0)*10/rows.length)/10:null;
}

type MarketingRow={spend_cents:number;impressions:number;reach:number;clicks:number;inquiries:number;bookings:number;revenue_cents:number};
async function marketingRows(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters){
  const campaign=numberFilter(filters,"campaign");
  return collectPages<MarketingRow>(async(from,to)=>{
    let query=client.from("marketing_campaign_metrics").select("spend_cents,impressions,reach,clicks,inquiries,bookings,revenue_cents").gte("metric_date",bounds.fromDate).lte("metric_date",bounds.toDate);
    if(campaign)query=query.eq("campaign_id",campaign);
    const result=await query.range(from,to);return {data:(result.data??[]) as MarketingRow[],error:result.error};
  });
}
function marketingValue(key:string,rows:MarketingRow[]){
  const sums=rows.reduce((all,row)=>({spend:all.spend+row.spend_cents,revenue:all.revenue+row.revenue_cents,impressions:all.impressions+row.impressions,reach:all.reach+row.reach,clicks:all.clicks+row.clicks,inquiries:all.inquiries+row.inquiries,bookings:all.bookings+row.bookings}),{spend:0,revenue:0,impressions:0,reach:0,clicks:0,inquiries:0,bookings:0});
  if(key==="marketing_spend")return sums.spend;if(key==="marketing_revenue")return sums.revenue;if(key==="marketing_impressions")return sums.impressions;if(key==="marketing_reach")return sums.reach;if(key==="marketing_clicks")return sums.clicks;if(key==="marketing_inquiries")return sums.inquiries;if(key==="marketing_bookings")return sums.bookings;
  const ratio=(numerator:number,denominator:number)=>denominator?Math.round(numerator*1000/denominator)/10:null;
  if(key==="marketing_ctr")return ratio(sums.clicks,sums.impressions);
  if(key==="marketing_inquiry_rate")return ratio(sums.inquiries,sums.clicks);
  if(key==="marketing_booking_rate")return ratio(sums.bookings,sums.inquiries);
  if(key==="marketing_roi")return ratio(sums.revenue-sums.spend,sums.spend);
  throw new Error("Métrica de Marketing no soportada.");
}

async function missionMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,key:string){
  const teacher=textFilter(filters,"teacher"),type=textFilter(filters,"mission_type"),priority=textFilter(filters,"priority");
  if(type&&!['primary','daily','growth'].includes(type))throw new Error("Tipo de misión no válido.");
  if(priority&&!['normal','priority','urgent'].includes(priority))throw new Error("Prioridad no válida.");
  if(key==="missions_open"){
    let query=client.from("missions").select("id",{count:"exact",head:true}).in("state",["available","upcoming","in_progress"]);
    if(type)query=query.eq("mission_type",type);if(priority)query=query.eq("priority",priority);
    return exactCount(query);
  }
  if(key==="missions_completed"){
    let query=client.from("missions").select("id",{count:"exact",head:true}).in("state",["completed","completed_automatically"]).gte("completed_at",bounds.fromIso).lt("completed_at",bounds.toIso);
    if(teacher)query=query.eq("completed_by",teacher);if(type)query=query.eq("mission_type",type);if(priority)query=query.eq("priority",priority);
    return exactCount(query);
  }
  type Row={expired_at:string|null;updated_at:string};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("missions").select("expired_at,updated_at").in("state",["not_done","expired"]);
    if(type)query=query.eq("mission_type",type);if(priority)query=query.eq("priority",priority);
    const result=await query.range(from,to);return {data:(result.data??[]) as Row[],error:result.error};
  });
  return rows.filter((row)=>inBounds(row.expired_at??row.updated_at,bounds)).length;
}

async function notificationMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,key:string){
  const channel=textFilter(filters,"channel"),event=textFilter(filters,"event_key");
  if(channel&&!['internal','email','whatsapp','system'].includes(channel))throw new Error("Canal no válido.");
  if(key==="notification_attempts"){
    type Row={attempt_count:number};
    const rows=await collectPages<Row>(async(from,to)=>{
      let query=client.from("notification_deliveries").select("attempt_count").gte("queued_at",bounds.fromIso).lt("queued_at",bounds.toIso);
      if(channel)query=query.eq("channel",channel);if(event)query=query.eq("event_key",event);
      const result=await query.range(from,to);return {data:(result.data??[]) as Row[],error:result.error};
    });
    return rows.reduce((sum,row)=>sum+row.attempt_count,0);
  }
  const status=key==="notifications_sent"?"sent":"failed";
  type Row={sent_at:string|null;last_attempt_at:string|null;queued_at:string};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("notification_deliveries").select("sent_at,last_attempt_at,queued_at").eq("status",status);
    if(channel)query=query.eq("channel",channel);if(event)query=query.eq("event_key",event);
    const result=await query.range(from,to);return {data:(result.data??[]) as Row[],error:result.error};
  });
  return rows.filter((row)=>inBounds(row.sent_at??row.last_attempt_at??row.queued_at,bounds)).length;
}

async function bzMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,key:string){
  const student=numberFilter(filters,"student");
  if(key==="bz_redemptions"){
    let query=client.from("bz_reward_redemptions").select("id",{count:"exact",head:true}).gte("created_at",bounds.fromIso).lt("created_at",bounds.toIso);
    if(student)query=query.eq("person_id",student);
    return exactCount(query);
  }
  type Row={person_id:number;entry_type:string;points_delta:number;created_at:string};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("bz_point_ledger").select("person_id,entry_type,points_delta,created_at").gte("created_at",bounds.fromIso).lt("created_at",bounds.toIso);
    if(student)query=query.eq("person_id",student);
    if(key==="bz_points_redeemed")query=query.eq("entry_type","redeem");
    else query=query.eq("entry_type","earn");
    const result=await query.range(from,to);
    return {data:(result.data??[]) as Row[],error:result.error};
  });
  if(key==="bz_points_earned")return rows.reduce((sum,row)=>sum+Math.max(0,row.points_delta),0);
  if(key==="bz_points_redeemed")return rows.reduce((sum,row)=>sum+Math.abs(Math.min(0,row.points_delta)),0);
  if(key==="bz_earn_events")return rows.length;
  if(key==="bz_active_people")return new Set(rows.map((row)=>row.person_id)).size;
  throw new Error("Métrica BZ no soportada.");
}

export async function calculateStatistic(client:SupabaseClient,metricKey:string,period:StatisticPeriod,filters:StatisticFilters={}):Promise<StatisticValue>{
  const metric=statisticCatalogByKey.get(metricKey);
  if(!metric)throw new Error(`Métrica no soportada: ${metricKey}`);
  const bounds=statisticPeriodBounds(period);
  let value:number|null;
  if(metricKey==="classes_count"||metricKey==="class_minutes"){
    const rows=await classRows(client,bounds,filters);
    value=metricKey==="classes_count"?rows.length:rows.reduce((sum,row)=>sum+(row.actual_duration_minutes??row.duration_minutes??0),0);
  }else if(metricKey==="attendance_rate")value=await attendanceRate(client,bounds,filters);
  else if(metricKey==="students_active"||metricKey==="new_students")value=await studentCount(client,bounds,filters,metricKey==="new_students");
  else if(metricKey==="credit_sales"||metricKey==="credit_grants")value=await grantMetric(client,bounds,filters,metricKey==="credit_sales");
  else if(metricKey==="assignments_created"||metricKey==="assignments_completed"||metricKey==="assignments_pending")value=await assignmentCount(client,bounds,filters,metricKey==="assignments_completed"?"completed":metricKey==="assignments_pending"?"pending":"created");
  else if(metricKey==="evaluations_count"||metricKey==="evaluation_average")value=await evaluationMetric(client,bounds,filters,metricKey==="evaluation_average");
  else if(metric.block==="bz")value=await bzMetric(client,bounds,filters,metricKey);
  else if(metric.block==="marketing")value=marketingValue(metricKey,await marketingRows(client,bounds,filters));
  else if(metricKey.startsWith("missions_"))value=await missionMetric(client,bounds,filters,metricKey);
  else if(metricKey.startsWith("notification"))value=await notificationMetric(client,bounds,filters,metricKey);
  else throw new Error(`Métrica no soportada: ${metricKey}`);
  return {metric_key:metricKey,value,from:bounds.fromIso,to:bounds.toIso,filters};
}
