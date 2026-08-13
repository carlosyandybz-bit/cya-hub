import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPages, locationMatches, numberFilter, relationOne, textFilter, type PeriodBounds, type StatisticFilters } from "./statistics-engine-core";

type DirectClassRow={id:number;actual_duration_minutes:number|null;duration_minutes:number;location_text:string|null};
type ParticipantClassRow={class_id:number;classes:DirectClassRow|DirectClassRow[]|null};

async function filteredClasses(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters){
  const student=numberFilter(filters,"student"),teacher=textFilter(filters,"teacher"),style=numberFilter(filters,"style"),status=textFilter(filters,"class_status"),location=textFilter(filters,"class_location"),scope=textFilter(filters,"location_scope");
  if(scope&&scope!=="inside"&&scope!=="outside")throw new Error("Ámbito de ubicación no válido.");
  if(student){
    const rows=await collectPages<ParticipantClassRow>(async(from,to)=>{
      let query=client.from("class_participants").select("class_id,classes!class_participants_class_id_fkey!inner(id,actual_duration_minutes,duration_minutes,location_text)").eq("person_id",student).gte("classes.scheduled_start_at",bounds.fromIso).lt("classes.scheduled_start_at",bounds.toIso);
      if(teacher)query=query.eq("classes.teacher_user_id",teacher);if(style)query=query.eq("classes.style_term_id",style);if(status)query=query.eq("classes.status",status);
      const result=await query.range(from,to);return {data:(result.data??[]) as ParticipantClassRow[],error:result.error};
    });
    return rows.map((row)=>relationOne(row.classes)).filter((row):row is DirectClassRow=>Boolean(row)).filter((row)=>locationMatches(row.location_text,location,scope));
  }
  const rows=await collectPages<DirectClassRow>(async(from,to)=>{
    let query=client.from("classes").select("id,actual_duration_minutes,duration_minutes,location_text").gte("scheduled_start_at",bounds.fromIso).lt("scheduled_start_at",bounds.toIso);
    if(teacher)query=query.eq("teacher_user_id",teacher);if(style)query=query.eq("style_term_id",style);if(status)query=query.eq("status",status);
    const result=await query.range(from,to);return {data:(result.data??[]) as DirectClassRow[],error:result.error};
  });
  return rows.filter((row)=>locationMatches(row.location_text,location,scope));
}

async function attendanceRate(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters){
  const student=numberFilter(filters,"student"),teacher=textFilter(filters,"teacher"),style=numberFilter(filters,"style"),location=textFilter(filters,"class_location"),scope=textFilter(filters,"location_scope");
  type ClassRef={location_text:string|null};type Row={attendance_status:string;classes:ClassRef|ClassRef[]|null};
  const rows=await collectPages<Row>(async(from,to)=>{
    let query=client.from("class_participants").select("attendance_status,classes!class_participants_class_id_fkey!inner(location_text)").gte("classes.scheduled_start_at",bounds.fromIso).lt("classes.scheduled_start_at",bounds.toIso).in("attendance_status",["present","absent"]);
    if(student)query=query.eq("person_id",student);if(teacher)query=query.eq("classes.teacher_user_id",teacher);if(style)query=query.eq("classes.style_term_id",style);
    const result=await query.range(from,to);return {data:(result.data??[]) as Row[],error:result.error};
  });
  const filtered=rows.filter((row)=>locationMatches(relationOne(row.classes)?.location_text??null,location,scope));
  return filtered.length?Math.round(filtered.filter((row)=>row.attendance_status==="present").length*1000/filtered.length)/10:null;
}

export async function calculateClassStatistic(client:SupabaseClient,key:string,bounds:PeriodBounds,filters:StatisticFilters){
  if(key==="attendance_rate")return attendanceRate(client,bounds,filters);
  const rows=await filteredClasses(client,bounds,filters);
  if(key==="classes_count")return rows.length;
  if(key==="class_minutes")return rows.reduce((sum,row)=>sum+(row.actual_duration_minutes??row.duration_minutes??0),0);
  throw new Error("Métrica de clases no soportada.");
}
