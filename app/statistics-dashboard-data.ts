import type { SupabaseClient } from "@supabase/supabase-js";

export type StatisticsDashboard = {
  id:number;
  name:string;
  description:string|null;
  scope:"global"|"teacher"|"personal";
  target_user_id:string|null;
  active:boolean;
  is_default:boolean;
  updated_at:string;
};

export type StatisticsDashboardCard = {
  id:number;
  dashboard_id:number;
  title:string;
  metric_key:string;
  period_kind:"today"|"this_week"|"this_month"|"this_year"|"rolling_days"|"custom";
  period_days:number|null;
  filters:Record<string,unknown>;
  display_kind:"number"|"currency"|"minutes"|"percentage"|"trend";
  position:number;
  width:"small"|"medium"|"large"|"full";
  active:boolean;
};

export type StatisticsDashboardSnapshot={dashboard:StatisticsDashboard|null;cards:StatisticsDashboardCard[]};

type Assignment={dashboard_id:number;is_default:boolean;active:boolean};

async function dashboardById(client:SupabaseClient,id:number){
  const result=await client.from("statistics_dashboards").select("id,name,description,scope,target_user_id,active,is_default,updated_at").eq("id",id).eq("active",true).maybeSingle();
  if(result.error)throw new Error(result.error.message);
  return (result.data??null) as StatisticsDashboard|null;
}

async function firstDashboard(client:SupabaseClient,scope:StatisticsDashboard["scope"],userId?:string){
  let query=client.from("statistics_dashboards").select("id,name,description,scope,target_user_id,active,is_default,updated_at").eq("scope",scope).eq("active",true).order("is_default",{ascending:false}).order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(1);
  if(userId)query=query.eq("target_user_id",userId);
  const result=await query.maybeSingle();
  if(result.error)throw new Error(result.error.message);
  return (result.data??null) as StatisticsDashboard|null;
}

export async function resolveStatisticsDashboard(client:SupabaseClient):Promise<StatisticsDashboardSnapshot>{
  const auth=await client.auth.getUser();
  if(auth.error)throw new Error(auth.error.message);
  const userId=auth.data.user?.id;
  if(!userId)throw new Error("No hay una sesión activa.");

  let dashboard=await firstDashboard(client,"personal",userId);
  if(!dashboard){
    const assignmentResult=await client.from("statistics_dashboard_assignments").select("dashboard_id,is_default,active").eq("user_id",userId).eq("active",true).order("is_default",{ascending:false}).order("assigned_at",{ascending:false});
    if(assignmentResult.error)throw new Error(assignmentResult.error.message);
    const assignments=(assignmentResult.data??[]) as Assignment[];
    for(const assignment of assignments){
      dashboard=await dashboardById(client,assignment.dashboard_id);
      if(dashboard)break;
    }
  }
  if(!dashboard)dashboard=await firstDashboard(client,"teacher",userId);
  if(!dashboard)dashboard=await firstDashboard(client,"global");
  if(!dashboard)return {dashboard:null,cards:[]};

  const cardResult=await client.from("statistics_dashboard_cards").select("id,dashboard_id,title,metric_key,period_kind,period_days,filters,display_kind,position,width,active").eq("dashboard_id",dashboard.id).eq("active",true).order("position").order("id");
  if(cardResult.error)throw new Error(cardResult.error.message);
  return {dashboard,cards:(cardResult.data??[]) as StatisticsDashboardCard[]};
}
