import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveStatisticsDashboardDetails(client:SupabaseClient,id:number,name:string,description:string){
  const cleanName=name.trim();
  if(!cleanName)throw new Error("El panel necesita un nombre.");
  const result=await client.from("statistics_dashboards").update({name:cleanName,description:description.trim()||null,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)throw new Error(result.error.message);
}

export async function publishStatisticsDashboard(client:SupabaseClient,id:number,isDefault:boolean){
  const result=await client.from("statistics_dashboards").update({active:true,is_default:isDefault,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)throw new Error(result.error.message);
}

export async function archiveStatisticsDashboard(client:SupabaseClient,id:number){
  const result=await client.from("statistics_dashboards").update({active:false,is_default:false,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)throw new Error(result.error.message);
}

export async function makeStatisticsDashboardGlobalDefault(client:SupabaseClient,id:number){
  const cleared=await client.from("statistics_dashboards").update({is_default:false,updated_at:new Date().toISOString()}).eq("scope","global").eq("active",true).neq("id",id);
  if(cleared.error)throw new Error(cleared.error.message);
  const result=await client.from("statistics_dashboards").update({is_default:true,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)throw new Error(result.error.message);
}

export async function setStatisticsDashboardAssignment(client:SupabaseClient,dashboardId:number,userId:string,active:boolean){
  const existing=await client.from("statistics_dashboard_assignments").select("dashboard_id,user_id").eq("dashboard_id",dashboardId).eq("user_id",userId).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data){
    const result=await client.from("statistics_dashboard_assignments").update({active,is_default:active}).eq("dashboard_id",dashboardId).eq("user_id",userId);
    if(result.error)throw new Error(result.error.message);
    return;
  }
  if(!active)return;
  const result=await client.from("statistics_dashboard_assignments").insert({dashboard_id:dashboardId,user_id:userId,is_default:true,active:true});
  if(result.error)throw new Error(result.error.message);
}
