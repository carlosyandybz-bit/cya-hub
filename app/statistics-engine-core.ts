import type { StatisticFilterKey } from "./statistics-catalog";

export type StatisticPeriodKind="today"|"this_week"|"this_month"|"this_year"|"rolling_days"|"custom";
export type StatisticPeriod={kind:StatisticPeriodKind;days?:number|null;from?:string|null;to?:string|null};
export type StatisticFilters=Partial<Record<StatisticFilterKey,string|number|null>>&Record<string,unknown>;
export type StatisticValue={metric_key:string;value:number|null;from:string;to:string;filters:StatisticFilters};
export type PeriodBounds={from:Date;to:Date;fromIso:string;toIso:string;fromDate:string;toDate:string};
export type PageResult<T>={data:T[]|null;error:{message:string}|null};

const PAGE_SIZE=1000;
function localDateKey(value:Date){const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,"0"),d=String(value.getDate()).padStart(2,"0");return `${y}-${m}-${d}`;}

export function statisticPeriodBounds(period:StatisticPeriod,now=new Date()):PeriodBounds{
  const to=period.kind==="custom"&&period.to?new Date(period.to):new Date(now);
  if(Number.isNaN(to.getTime()))throw new Error("Fin de periodo no válido.");
  let from=new Date(to);
  if(period.kind==="today")from.setHours(0,0,0,0);
  else if(period.kind==="this_week"){from.setHours(0,0,0,0);from.setDate(from.getDate()-((from.getDay()+6)%7));}
  else if(period.kind==="this_month")from=new Date(to.getFullYear(),to.getMonth(),1);
  else if(period.kind==="this_year")from=new Date(to.getFullYear(),0,1);
  else if(period.kind==="rolling_days"){
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

export async function collectPages<T>(fetchPage:(from:number,to:number)=>Promise<PageResult<T>>){
  const rows:T[]=[];
  for(let page=0;;page+=1){
    const from=page*PAGE_SIZE,to=from+PAGE_SIZE-1,result=await fetchPage(from,to);
    if(result.error)throw new Error(result.error.message);
    const batch=result.data??[];rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
  }
  return rows;
}

export function textFilter(filters:StatisticFilters,key:StatisticFilterKey){const value=filters[key];if(value==null)return null;const clean=String(value).trim();return clean||null;}
export function numberFilter(filters:StatisticFilters,key:StatisticFilterKey){const clean=textFilter(filters,key);if(clean==null)return null;const value=Number(clean);if(!Number.isSafeInteger(value)||value<1)throw new Error(`Filtro ${key} no válido.`);return value;}
export function locationMatches(location:string|null,needle:string|null,scope:string|null){if(!needle)return true;const match=(location??"").toLocaleLowerCase("es-ES").includes(needle.toLocaleLowerCase("es-ES"));return scope==="outside"?!match:match;}
export function relationOne<T>(value:T|T[]|null|undefined){return Array.isArray(value)?(value[0]??null):(value??null);}
export function inBounds(value:string|null|undefined,bounds:PeriodBounds){if(!value)return false;const time=new Date(value).getTime();return time>=bounds.from.getTime()&&time<bounds.to.getTime();}
export async function exactCount(query:PromiseLike<{count:number|null;error:{message:string}|null}>){const result=await query;if(result.error)throw new Error(result.error.message);return result.count??0;}
