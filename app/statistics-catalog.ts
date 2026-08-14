export type StatisticFormat = "number" | "currency" | "minutes" | "percentage";
export type StatisticBlock = "classes" | "students" | "business" | "teaching" | "bz" | "feedback" | "academy" | "marketing" | "operations";
export type StatisticFilterKey =
  | "teacher"
  | "student"
  | "class_location"
  | "location_scope"
  | "style"
  | "class_status"
  | "country"
  | "payment_status"
  | "content_type"
  | "campaign"
  | "mission_type"
  | "priority"
  | "channel"
  | "event_key";

export type StatisticMetric = {
  key: string;
  block: StatisticBlock;
  label: string;
  format: StatisticFormat;
  filters: StatisticFilterKey[];
  description: string;
};

export const statisticBlockLabels: Record<StatisticBlock, string> = {
  classes: "Clases",
  students: "Alumnado",
  business: "Negocio",
  teaching: "Enseñanza",
  bz: "BZ Points",
  feedback: "Feedback Online",
  academy: "Academia Online",
  marketing: "Marketing",
  operations: "Operación",
};

export const statisticCatalog: StatisticMetric[] = [
  { key:"classes_count", block:"classes", label:"Clases", format:"number", filters:["teacher","student","class_location","location_scope","style","class_status"], description:"Número de clases dentro del periodo." },
  { key:"class_minutes", block:"classes", label:"Minutos impartidos", format:"minutes", filters:["teacher","student","class_location","location_scope","style","class_status"], description:"Duración real, o planificada si aún no existe duración real." },
  { key:"attendance_rate", block:"classes", label:"Asistencia", format:"percentage", filters:["teacher","student","class_location","location_scope","style"], description:"Porcentaje de presentes sobre presentes + ausentes." },

  { key:"students_active", block:"students", label:"Alumnos activos", format:"number", filters:["country"], description:"Perfiles de alumno actualmente activos." },
  { key:"new_students", block:"students", label:"Nuevos alumnos", format:"number", filters:["country"], description:"Alumnos cuya fecha de alta cae dentro del periodo." },

  { key:"credit_sales", block:"business", label:"Importe de bonos", format:"currency", filters:["student","payment_status"], description:"Importe total de bonos según su estado de pago." },
  { key:"credit_grants", block:"business", label:"Bonos", format:"number", filters:["student","payment_status"], description:"Cantidad de bonos según su estado de pago." },

  { key:"assignments_created", block:"teaching", label:"Contenidos asignados", format:"number", filters:["student","style","content_type"], description:"Asignaciones creadas durante el periodo." },
  { key:"assignments_completed", block:"teaching", label:"Contenidos completados", format:"number", filters:["student","style","content_type"], description:"Asignaciones completadas durante el periodo." },
  { key:"assignments_pending", block:"teaching", label:"Contenidos pendientes", format:"number", filters:["student","style","content_type"], description:"Asignaciones abiertas creadas durante el periodo." },
  { key:"evaluations_count", block:"teaching", label:"Evaluaciones", format:"number", filters:["teacher","student","style"], description:"Valoraciones realizadas durante el periodo." },
  { key:"evaluation_average", block:"teaching", label:"Media de evaluación", format:"number", filters:["teacher","student","style"], description:"Puntuación media de las evaluaciones del periodo." },

  { key:"bz_points_earned", block:"bz", label:"BZ Points ganados", format:"number", filters:["student"], description:"Puntos concedidos por acciones premiadas durante el periodo." },
  { key:"bz_points_redeemed", block:"bz", label:"BZ Points canjeados", format:"number", filters:["student"], description:"Puntos gastados en recompensas durante el periodo." },
  { key:"bz_earn_events", block:"bz", label:"Acciones premiadas", format:"number", filters:["student"], description:"Número de acciones que generaron BZ Points." },
  { key:"bz_active_people", block:"bz", label:"Personas que han ganado BZ", format:"number", filters:[], description:"Personas distintas que recibieron puntos durante el periodo." },
  { key:"bz_redemptions", block:"bz", label:"Recompensas canjeadas", format:"number", filters:["student"], description:"Cupones o descuentos creados mediante canje durante el periodo." },

  { key:"feedback_submitted", block:"feedback", label:"Feedback enviados", format:"number", filters:["student","style"], description:"Solicitudes de Feedback Online enviadas durante el periodo." },
  { key:"feedback_completed", block:"feedback", label:"Feedback completados", format:"number", filters:["student","style"], description:"Revisiones de Feedback Online terminadas durante el periodo." },
  { key:"feedback_pending", block:"feedback", label:"Feedback pendientes", format:"number", filters:["student","style"], description:"Solicitudes que seguían pendientes o en revisión al cierre del periodo." },
  { key:"feedback_response_hours", block:"feedback", label:"Tiempo medio de respuesta", format:"number", filters:["student","style"], description:"Horas medias entre el envío del vídeo y la finalización del Feedback." },
  { key:"feedback_credits_purchased", block:"feedback", label:"Créditos de Feedback comprados", format:"number", filters:["student"], description:"Créditos añadidos por compras confirmadas; excluye ajustes manuales." },
  { key:"feedback_credits_consumed", block:"feedback", label:"Créditos de Feedback consumidos", format:"number", filters:["student"], description:"Créditos consumidos al enviar solicitudes; excluye ajustes y reembolsos." },

  { key:"academy_programs_published", block:"academy", label:"Programas publicados", format:"number", filters:["style"], description:"Programas de Academia publicados durante el periodo." },
  { key:"academy_enrollments_active", block:"academy", label:"Matrículas activas", format:"number", filters:["student"], description:"Matrículas activadas durante el periodo que continúan activas." },
  { key:"academy_people_enrolled", block:"academy", label:"Personas matriculadas", format:"number", filters:[], description:"Personas distintas matriculadas durante el periodo." },
  { key:"academy_progress_percent", block:"academy", label:"Progreso medio", format:"percentage", filters:["student"], description:"Porcentaje de lecciones completadas en las matrículas iniciadas durante el periodo." },

  { key:"marketing_spend", block:"marketing", label:"Inversión en campañas", format:"currency", filters:["campaign"], description:"Inversión registrada en campañas." },
  { key:"marketing_revenue", block:"marketing", label:"Ingresos atribuidos", format:"currency", filters:["campaign"], description:"Ingresos atribuidos a campañas." },
  { key:"marketing_impressions", block:"marketing", label:"Impresiones", format:"number", filters:["campaign"], description:"Impresiones registradas por campañas." },
  { key:"marketing_reach", block:"marketing", label:"Alcance", format:"number", filters:["campaign"], description:"Alcance registrado por campañas." },
  { key:"marketing_clicks", block:"marketing", label:"Clics", format:"number", filters:["campaign"], description:"Clics registrados por campañas." },
  { key:"marketing_inquiries", block:"marketing", label:"Consultas", format:"number", filters:["campaign"], description:"Consultas atribuidas a campañas." },
  { key:"marketing_bookings", block:"marketing", label:"Reservas de campañas", format:"number", filters:["campaign"], description:"Reservas atribuidas a campañas." },
  { key:"marketing_ctr", block:"marketing", label:"CTR", format:"percentage", filters:["campaign"], description:"Clics / impresiones × 100." },
  { key:"marketing_inquiry_rate", block:"marketing", label:"Conversión clic → consulta", format:"percentage", filters:["campaign"], description:"Consultas / clics × 100." },
  { key:"marketing_booking_rate", block:"marketing", label:"Conversión consulta → reserva", format:"percentage", filters:["campaign"], description:"Reservas / consultas × 100." },
  { key:"marketing_roi", block:"marketing", label:"ROI de campañas", format:"percentage", filters:["campaign"], description:"(Ingresos - inversión) / inversión × 100." },

  { key:"missions_open", block:"operations", label:"Misiones abiertas", format:"number", filters:["mission_type","priority"], description:"Misiones próximas, disponibles o en progreso." },
  { key:"missions_completed", block:"operations", label:"Misiones completadas", format:"number", filters:["teacher","mission_type","priority"], description:"Misiones completadas durante el periodo." },
  { key:"missions_not_done", block:"operations", label:"Misiones no realizadas / caducadas", format:"number", filters:["mission_type","priority"], description:"Misiones no realizadas o caducadas en el periodo." },
  { key:"notifications_sent", block:"operations", label:"Notificaciones enviadas", format:"number", filters:["channel","event_key"], description:"Entregas enviadas durante el periodo." },
  { key:"notifications_failed", block:"operations", label:"Notificaciones fallidas", format:"number", filters:["channel","event_key"], description:"Entregas fallidas durante el periodo." },
  { key:"notification_attempts", block:"operations", label:"Intentos de notificación", format:"number", filters:["channel","event_key"], description:"Suma de intentos de entrega en el periodo." },
];

export const statisticCatalogByKey = new Map(statisticCatalog.map((metric) => [metric.key, metric]));
