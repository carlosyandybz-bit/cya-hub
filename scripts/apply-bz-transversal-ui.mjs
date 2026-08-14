import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source,before,after,label){
  const first=source.indexOf(before);
  if(first<0) throw new Error(`${label}: fragment not found`);
  if(source.indexOf(before,first+before.length)>=0) throw new Error(`${label}: fragment is not unique`);
  return source.slice(0,first)+after+source.slice(first+before.length);
}
function patch(path,changes){let source=readFileSync(path,"utf8");for(const [before,after,label] of changes) source=replaceOnce(source,before,after,`${path} · ${label}`);writeFileSync(path,source);}

patch("app/admin-data-transfer.tsx",[
  [
    '  ["calendar", "Agenda y calendario"],\n  ["settings", "Configuración"],',
    '  ["calendar", "Agenda y calendario"],\n  ["bz", "BZ Points y recompensas"],\n  ["settings", "Configuración"],',
    "BZ export domain",
  ],
  [
    '  ["marketing_rates", "Tarifas"],\n  ["complete", "Copia CYA completa"],',
    '  ["marketing_rates", "Tarifas"],\n  ["bz", "BZ Points y recompensas"],\n  ["complete", "Copia CYA completa"],',
    "BZ import domain",
  ],
]);

patch("app/statistics-engine.ts",[
  [
    'export async function calculateStatistic(client:SupabaseClient,metricKey:string,period:StatisticPeriod,filters:StatisticFilters={}):Promise<StatisticValue>{',
    `async function bzMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,key:string){
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

export async function calculateStatistic(client:SupabaseClient,metricKey:string,period:StatisticPeriod,filters:StatisticFilters={}):Promise<StatisticValue>{`,
    "BZ metric calculator",
  ],
  [
    '  else if(metric.block==="marketing")value=marketingValue(metricKey,await marketingRows(client,bounds,filters));\n  else if(metricKey.startsWith("missions_"))value=await missionMetric(client,bounds,filters,metricKey);',
    '  else if(metric.block==="bz")value=await bzMetric(client,bounds,filters,metricKey);\n  else if(metric.block==="marketing")value=marketingValue(metricKey,await marketingRows(client,bounds,filters));\n  else if(metricKey.startsWith("missions_"))value=await missionMetric(client,bounds,filters,metricKey);',
    "BZ metric routing",
  ],
]);

console.log("BZ transfer and P30 integration applied exactly once.");
