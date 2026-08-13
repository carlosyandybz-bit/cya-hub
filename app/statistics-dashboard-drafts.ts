import type { SupabaseClient } from "@supabase/supabase-js";

type DashboardScope="global"|"teacher"|"personal";

export async function createStatisticsDashboardDraft(client:SupabaseClient,name:string,scope:DashboardScope,targetUserId:string|null){
  const cleanName=name.trim();
  if(!cleanName)throw new Error("Pon un nombre al panel.");
  if(scope!=="global"&&!targetUserId)throw new Error("Elige un profesor.");
  const result=await client.from("statistics_dashboards").insert({name:cleanName,scope,target_user_id:scope==="global"?null:targetUserId,active:false,is_default:false}).select("id").single();
  if(result.error)throw new Error(result.error.message);
  return Number(result.data.id);
}
