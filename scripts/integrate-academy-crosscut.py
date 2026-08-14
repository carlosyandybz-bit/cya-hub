from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


replace(
    "app/statistics-catalog.ts",
    'export type StatisticBlock = "classes" | "students" | "business" | "teaching" | "bz" | "feedback" | "marketing" | "operations";',
    'export type StatisticBlock = "classes" | "students" | "business" | "teaching" | "bz" | "feedback" | "academy" | "marketing" | "operations";',
)
replace(
    "app/statistics-catalog.ts",
    '  feedback: "Feedback Online",\n  marketing: "Marketing",',
    '  feedback: "Feedback Online",\n  academy: "Academia Online",\n  marketing: "Marketing",',
)
replace(
    "app/statistics-catalog.ts",
    '  { key:"feedback_credits_consumed", block:"feedback", label:"Créditos de Feedback consumidos", format:"number", filters:["student"], description:"Créditos consumidos al enviar solicitudes; excluye ajustes y reembolsos." },\n\n  { key:"marketing_spend"',
    '  { key:"feedback_credits_consumed", block:"feedback", label:"Créditos de Feedback consumidos", format:"number", filters:["student"], description:"Créditos consumidos al enviar solicitudes; excluye ajustes y reembolsos." },\n\n'
    '  { key:"academy_programs_published", block:"academy", label:"Programas publicados", format:"number", filters:["style"], description:"Programas de Academia publicados durante el periodo." },\n'
    '  { key:"academy_enrollments_active", block:"academy", label:"Matrículas activas", format:"number", filters:["student"], description:"Matrículas activadas durante el periodo que continúan activas." },\n'
    '  { key:"academy_people_enrolled", block:"academy", label:"Personas matriculadas", format:"number", filters:[], description:"Personas distintas matriculadas durante el periodo." },\n'
    '  { key:"academy_progress_percent", block:"academy", label:"Progreso medio", format:"percentage", filters:["student"], description:"Porcentaje de lecciones completadas en las matrículas iniciadas durante el periodo." },\n\n'
    '  { key:"marketing_spend"',
)

academy_engine = r'''
async function academyMetric(client:SupabaseClient,bounds:PeriodBounds,filters:StatisticFilters,key:string){
  const student=numberFilter(filters,"student"),style=numberFilter(filters,"style");
  if(key==="academy_programs_published"){
    let query=client.from("academy_programs").select("id",{count:"exact",head:true}).eq("publication_status","published").gte("published_at",bounds.fromIso).lt("published_at",bounds.toIso);
    if(style)query=query.eq("style_term_id",style);
    return exactCount(query);
  }
  if(key==="academy_enrollments_active"){
    let query=client.from("academy_enrollments").select("id",{count:"exact",head:true}).eq("status","active").gte("starts_at",bounds.fromIso).lt("starts_at",bounds.toIso);
    if(student)query=query.eq("person_id",student);
    return exactCount(query);
  }
  if(key==="academy_people_enrolled"){
    type Row={person_id:number};
    const rows=await collectPages<Row>(async(from,to)=>{
      const result=await client.from("academy_enrollments").select("person_id").in("status",["active","completed"]).gte("starts_at",bounds.fromIso).lt("starts_at",bounds.toIso).range(from,to);
      return {data:(result.data??[]) as Row[],error:result.error};
    });
    return new Set(rows.map((row)=>row.person_id)).size;
  }
  if(key==="academy_progress_percent"){
    type EnrollmentRef={person_id:number;starts_at:string};
    type Row={status:string;academy_enrollments:EnrollmentRef|EnrollmentRef[]|null};
    const rows=await collectPages<Row>(async(from,to)=>{
      let query=client.from("academy_progress").select("status,academy_enrollments!inner(person_id,starts_at)").gte("academy_enrollments.starts_at",bounds.fromIso).lt("academy_enrollments.starts_at",bounds.toIso);
      if(student)query=query.eq("academy_enrollments.person_id",student);
      const result=await query.range(from,to);
      return {data:(result.data??[]) as Row[],error:result.error};
    });
    return rows.length?Math.round(rows.filter((row)=>row.status==="completed").length*1000/rows.length)/10:null;
  }
  throw new Error("Métrica de Academia Online no soportada.");
}

'''
replace(
    "app/statistics-engine.ts",
    'export async function calculateStatistic(client:SupabaseClient,metricKey:string,period:StatisticPeriod,filters:StatisticFilters={}):Promise<StatisticValue>{',
    academy_engine + 'export async function calculateStatistic(client:SupabaseClient,metricKey:string,period:StatisticPeriod,filters:StatisticFilters={}):Promise<StatisticValue>{',
)
replace(
    "app/statistics-engine.ts",
    '  else if(metric.block==="feedback")value=await feedbackMetric(client,bounds,filters,metricKey);\n  else if(metric.block==="marketing")',
    '  else if(metric.block==="feedback")value=await feedbackMetric(client,bounds,filters,metricKey);\n  else if(metric.block==="academy")value=await academyMetric(client,bounds,filters,metricKey);\n  else if(metric.block==="marketing")',
)

replace(
    "app/admin-data-transfer.tsx",
    '  ["feedback", "Feedback Online"],\n  ["settings", "Configuración"],',
    '  ["feedback", "Feedback Online"],\n  ["academy", "Academia Online"],\n  ["settings", "Configuración"],',
)
replace(
    "app/admin-data-transfer.tsx",
    '  ["feedback", "Feedback Online"],\n  ["complete", "Copia CYA completa"],',
    '  ["feedback", "Feedback Online"],\n  ["academy", "Academia Online"],\n  ["complete", "Copia CYA completa"],',
)
replace(
    "app/admin-data-transfer.tsx",
    '      if (parsed.kind === "rows" && importDomain === "feedback") throw new Error("Feedback Online se importa desde una copia JSON exportada por CYA Hub, no desde CSV/Excel plano.");',
    '      if (parsed.kind === "rows" && importDomain === "feedback") throw new Error("Feedback Online se importa desde una copia JSON exportada por CYA Hub, no desde CSV/Excel plano.");\n      if (parsed.kind === "rows" && importDomain === "academy") throw new Error("Academia Online se importa desde una copia JSON exportada por CYA Hub, no desde CSV/Excel plano.");',
)

replace(
    "app/admin-data-reset.tsx",
    '    description: "Perfiles de alumno, clases, bonos, evaluaciones, medidas, asignaciones, incidencias, historial BZ y actividad de Feedback Online. Los contactos CRM se conservan.",',
    '    description: "Perfiles de alumno, clases, bonos, evaluaciones, medidas, asignaciones, incidencias, historial BZ, Feedback Online y matrículas/progreso de Academia. Los contactos CRM se conservan.",',
)
replace(
    "app/admin-data-reset.tsx",
    '    description: "Correcciones, explicaciones, ejercicios, secuencias, relaciones, multimedia, asignaciones/medidas y vínculos de Feedback Online con ese contenido.",',
    '    description: "Correcciones, explicaciones, ejercicios, secuencias, relaciones, multimedia, asignaciones/medidas y vínculos de Feedback/Academia con ese contenido.",',
)
replace(
    "app/admin-data-reset.tsx",
    '    description: "Borra personas no vinculadas al equipo, alumnado, clases, bonos, evaluaciones, CRM, marketing, misiones, agenda, avisos, formularios enviados, historial BZ y actividad de Feedback Online. Conserva la biblioteca de enseñanza y la configuración de BZ/Feedback.",',
    '    description: "Borra personas no vinculadas al equipo, alumnado, clases, bonos, evaluaciones, CRM, marketing, misiones, agenda, avisos, formularios enviados, historial BZ, Feedback Online y matrículas/progreso de Academia. Conserva Enseñanza, programas de Academia y configuración.",',
)
replace(
    "app/admin-data-reset.tsx",
    '    description: "Deja la aplicación vacía de datos de negocio y contenido creado: alumnado, personas de prueba, enseñanza, clases, bonos, evaluaciones, medidas, CRM, marketing, estadísticas, misiones, agenda, formularios enviados, tarifas, frases, historial BZ y actividad de Feedback Online. Conserva la configuración base de BZ/Feedback.",',
    '    description: "Deja la aplicación vacía de datos de negocio y contenido creado: alumnado, personas de prueba, enseñanza, Academia, clases, bonos, evaluaciones, medidas, CRM, marketing, estadísticas, misiones, agenda, formularios enviados, tarifas, frases, historial BZ y Feedback Online. Conserva la configuración base y el orden de módulos.",',
)
replace(
    "app/admin-data-reset.tsx",
    '  feedback_online: "registros de Feedback Online",\n  medidas:',
    '  feedback_online: "registros de Feedback Online",\n  academy_online: "registros de Academia Online",\n  medidas:',
)

replace(
    ".github/workflows/p32-release-qa.yml",
    'tests/postrelease-bz-points.test.mjs tests/postrelease-feedback-online.test.mjs',
    'tests/postrelease-bz-points.test.mjs tests/postrelease-feedback-online.test.mjs tests/postrelease-academia-online.test.mjs',
)
