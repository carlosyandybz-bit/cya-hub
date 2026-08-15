export type CyaIconCategory = "Navegación" | "Enseñanza" | "Alumno" | "Gestión" | "Marketing" | "Administración" | "Acciones" | "Estados";

export type CyaIconDefinition = {
  key: string;
  label: string;
  category: CyaIconCategory;
  usage: string;
};

export const CYA_ICON_CATALOG: CyaIconDefinition[] = [
  { key: "navigation.home", label: "Inicio", category: "Navegación", usage: "Navegación principal" },
  { key: "navigation.students", label: "Alumnado", category: "Navegación", usage: "Navegación principal y accesos a personas" },
  { key: "navigation.live", label: "Dar clase", category: "Navegación", usage: "Acción central de clase" },
  { key: "navigation.teaching", label: "Enseñanza", category: "Navegación", usage: "Biblioteca y contenidos" },
  { key: "navigation.marketing", label: "Marketing", category: "Navegación", usage: "CRM y marketing" },
  { key: "navigation.calendar", label: "Agenda y calendario", category: "Navegación", usage: "Agenda, calendario y próximas acciones" },
  { key: "navigation.notifications", label: "Notificaciones", category: "Navegación", usage: "Campanas y bandejas de avisos" },
  { key: "navigation.profile", label: "Cuenta y perfil", category: "Navegación", usage: "Cuenta, perfil y cambio de experiencia" },
  { key: "teaching.correction", label: "Correcciones", category: "Enseñanza", usage: "Correcciones y errores pedagógicos" },
  { key: "teaching.explanation", label: "Explicaciones", category: "Enseñanza", usage: "Explicaciones pedagógicas" },
  { key: "teaching.exercise", label: "Ejercicios", category: "Enseñanza", usage: "Ejercicios y práctica" },
  { key: "teaching.sequence", label: "Secuencias", category: "Enseñanza", usage: "Secuencias y combinaciones" },
  { key: "teaching.graph", label: "Árbol de enseñanza", category: "Enseñanza", usage: "Mapa relacional de conocimiento" },
  { key: "teaching.evaluation", label: "Evaluaciones", category: "Enseñanza", usage: "Evaluación y evolución" },
  { key: "student.progress", label: "Progreso", category: "Alumno", usage: "Progreso y evolución del alumno" },
  { key: "student.missions", label: "Misiones", category: "Alumno", usage: "Misiones y siguientes acciones" },
  { key: "student.bz", label: "BZ Points", category: "Alumno", usage: "Puntos y recompensas" },
  { key: "student.feedback", label: "Feedback Online", category: "Alumno", usage: "Feedback audiovisual" },
  { key: "student.academy", label: "Academia Online", category: "Alumno", usage: "Academia y aprendizaje online" },
  { key: "student.bonus", label: "Bonos y saldo", category: "Alumno", usage: "Bonos, saldo y compras" },
  { key: "management.classes", label: "Clases", category: "Gestión", usage: "Clases programadas e historial" },
  { key: "management.people", label: "Personas", category: "Gestión", usage: "Personas y alumnado" },
  { key: "management.missions", label: "Misiones operativas", category: "Gestión", usage: "Misiones del equipo y agenda" },
  { key: "management.crm", label: "CRM", category: "Gestión", usage: "Contactos y oportunidades" },
  { key: "management.rates", label: "Tarifas", category: "Gestión", usage: "Tarifas e importes" },
  { key: "marketing.campaigns", label: "Campañas", category: "Marketing", usage: "Campañas y comunicaciones" },
  { key: "marketing.content", label: "Contenido", category: "Marketing", usage: "Creación y planificación de contenido" },
  { key: "marketing.events", label: "Eventos", category: "Marketing", usage: "Eventos en Agenda y planificación" },
  { key: "marketing.statistics", label: "Estadísticas", category: "Marketing", usage: "Métricas y resultados" },
  { key: "admin.general", label: "General", category: "Administración", usage: "Configuración general" },
  { key: "admin.team", label: "Equipo y roles", category: "Administración", usage: "Equipo, roles y profesores" },
  { key: "admin.forms", label: "Formularios", category: "Administración", usage: "Motor de formularios" },
  { key: "admin.teaching", label: "Configurar enseñanza", category: "Administración", usage: "Configuración pedagógica" },
  { key: "admin.data", label: "Datos", category: "Administración", usage: "Importación, exportación y reset" },
  { key: "admin.integrations", label: "Integraciones", category: "Administración", usage: "Integraciones externas" },
  { key: "admin.appearance", label: "Apariencia", category: "Administración", usage: "Identidad visual e iconos" },
  { key: "admin.security", label: "Seguridad", category: "Administración", usage: "Seguridad y auditoría" },
  { key: "action.add", label: "Añadir", category: "Acciones", usage: "Crear o añadir elementos" },
  { key: "action.edit", label: "Editar", category: "Acciones", usage: "Editar contenido" },
  { key: "action.delete", label: "Eliminar", category: "Acciones", usage: "Eliminar elementos" },
  { key: "action.search", label: "Buscar", category: "Acciones", usage: "Buscadores" },
  { key: "action.filter", label: "Filtrar", category: "Acciones", usage: "Filtros" },
  { key: "action.save", label: "Guardar", category: "Acciones", usage: "Guardar cambios" },
  { key: "action.upload", label: "Subir archivo", category: "Acciones", usage: "Subidas de multimedia" },
  { key: "action.back", label: "Volver", category: "Acciones", usage: "Navegación hacia atrás" },
  { key: "action.forward", label: "Avanzar", category: "Acciones", usage: "Navegación hacia delante" },
  { key: "state.success", label: "Correcto", category: "Estados", usage: "Éxito y completado" },
  { key: "state.warning", label: "Atención", category: "Estados", usage: "Avisos no críticos" },
  { key: "state.error", label: "Error", category: "Estados", usage: "Errores e incidencias" },
  { key: "state.locked", label: "Bloqueado", category: "Estados", usage: "Contenido o acción bloqueada" },
];

export const CYA_ICON_KEYS = new Set(CYA_ICON_CATALOG.map((item) => item.key));
