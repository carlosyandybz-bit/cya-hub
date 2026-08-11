"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  DatabaseBackup,
  GraduationCap,
  Megaphone,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserRoundX,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { downloadBundle, type CyaDataBundle } from "./data-transfer-formats-safe";
import styles from "./admin-data-reset.module.css";

type ResetScope =
  | "person"
  | "teaching_content"
  | "students"
  | "teaching"
  | "classes"
  | "credits"
  | "evaluations"
  | "marketing"
  | "missions_calendar_notifications"
  | "operational"
  | "full";

type SearchKind = "person" | "teaching_content";

type SearchTarget = {
  kind: SearchKind;
  id: number;
  label: string;
  subtype: string;
  detail: string;
  protected: boolean;
};

type ResetPreview = {
  job_id: number;
  scope: ResetScope;
  target_id: number | null;
  target_label: string | null;
  confirmation_phrase: string;
  expires_at: string;
  preview: {
    counts: Record<string, number>;
    total: number;
    scope_label: string;
    preserves: string[];
  };
};

const scopes: Array<{
  scope: Exclude<ResetScope, "person" | "teaching_content">;
  title: string;
  description: string;
  icon: typeof Trash2;
}> = [
  {
    scope: "students",
    title: "Todos los alumnos",
    description: "Perfiles de alumno, clases, bonos, evaluaciones, medidas, asignaciones e incidencias. Los contactos CRM se conservan.",
    icon: UserRoundX,
  },
  {
    scope: "teaching",
    title: "Toda la enseñanza",
    description: "Correcciones, explicaciones, ejercicios, secuencias, relaciones, multimedia y sus asignaciones/medidas.",
    icon: GraduationCap,
  },
  {
    scope: "classes",
    title: "Todas las clases",
    description: "Clases, participantes, notas, archivos, contenidos trabajados, evaluaciones de clase y cierre financiero de esas clases.",
    icon: CalendarClock,
  },
  {
    scope: "credits",
    title: "Bonos y finanzas",
    description: "Todos los bonos, miembros y movimientos asociados. Las clases permanecen, pero pierden las referencias al bono borrado.",
    icon: WalletCards,
  },
  {
    scope: "evaluations",
    title: "Evaluaciones, medidas y progreso",
    description: "Sesiones, respuestas, progreso, decisiones, premios y mediciones pedagógicas derivadas.",
    icon: BookOpenCheck,
  },
  {
    scope: "marketing",
    title: "Marketing y CRM",
    description: "CRM, actividades, contenido, eventos, campañas, métricas y comunicaciones. Conserva personas y catálogo de tarifas.",
    icon: Megaphone,
  },
  {
    scope: "missions_calendar_notifications",
    title: "Misiones, agenda y avisos",
    description: "Misiones generadas, comentarios/evidencias, eventos de calendario y entregas de notificación. Conserva reglas e integraciones.",
    icon: CalendarClock,
  },
  {
    scope: "operational",
    title: "Limpiar datos operativos",
    description: "Borra personas no vinculadas al equipo, alumnado, clases, bonos, evaluaciones, CRM, marketing, misiones, agenda, avisos y formularios enviados. Conserva la biblioteca de enseñanza y configuración.",
    icon: RotateCcw,
  },
  {
    scope: "full",
    title: "Reinicio completo de CYA Hub",
    description: "Deja la aplicación vacía de datos de negocio y contenido creado: alumnado, personas de prueba, enseñanza, clases, bonos, evaluaciones, medidas, CRM, marketing, estadísticas, misiones, agenda, formularios enviados, tarifas, frases e historial de pruebas.",
    icon: ShieldAlert,
  },
];

const countLabels: Record<string, string> = {
  personas: "personas",
  personas_no_staff: "personas no vinculadas al equipo",
  perfiles_alumno: "perfiles de alumno",
  clases: "clases",
  clases_compartidas: "clases relacionadas",
  participantes: "participaciones",
  bonos: "bonos",
  miembros_bono: "miembros de bono",
  movimientos: "movimientos",
  evaluaciones: "evaluaciones",
  evaluaciones_clase: "evaluaciones de clase",
  sesiones: "sesiones",
  respuestas: "respuestas",
  progreso: "registros de progreso",
  decisiones: "decisiones",
  premios: "premios",
  premios_progreso: "premios de progreso",
  medidas: "medidas",
  medidas_contenido: "medidas de contenido",
  asignaciones: "asignaciones",
  incidencias: "incidencias",
  crm: "registros CRM",
  contenidos: "contenidos",
  ensenanza: "contenidos pedagógicos",
  relaciones: "relaciones",
  multimedia: "archivos multimedia",
  uso_en_clases: "usos en clase",
  notas: "notas",
  contenido_clase: "contenidos trabajados",
  archivos_clase: "archivos de clase",
  finanzas_clase: "registros financieros de clase",
  referencias_financieras: "referencias financieras",
  contenido: "registros de contenido",
  eventos: "eventos",
  campanas: "campañas",
  metricas: "métricas",
  marketing: "registros de marketing",
  metricas_marketing: "métricas de marketing",
  comunicaciones: "comunicaciones",
  misiones: "misiones",
  comentarios_evidencias: "comentarios/evidencias",
  eventos_calendario: "eventos de agenda",
  agenda: "eventos de agenda",
  avisos: "avisos",
  entregas_notificacion: "entregas de notificación",
  notificaciones: "notificaciones",
  formularios_enviados: "formularios enviados",
  tarifas: "tarifas",
  frases_diarias: "frases diarias",
  historial_transferencias: "trabajos de importación/exportación",
  auditoria_previa: "eventos de auditoría previos",
};

function readableError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("permiso")) {
    return "Tu cuenta no tiene permiso administrativo para realizar esta operación.";
  }
  return message;
}

export function AdminDataReset({
  client,
  refresh,
  notify,
}: {
  client: SupabaseClient;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [searchKind, setSearchKind] = useState<SearchKind>("person");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTarget[]>([]);
  const [selected, setSelected] = useState<SearchTarget | null>(null);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [finalArmed, setFinalArmed] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  const [busy, setBusy] = useState("");

  const exactConfirmation = Boolean(preview && confirmation === preview.confirmation_phrase);
  const previewCounts = useMemo(
    () =>
      Object.entries(preview?.preview.counts ?? {})
        .filter(([, value]) => Number(value) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1])),
    [preview],
  );

  function clearConfirmation() {
    setPreview(null);
    setConfirmation("");
    setFinalArmed(false);
  }

  async function searchTargets() {
    setBusy("search");
    clearConfirmation();
    setSelected(null);
    try {
      const result = await client.rpc("search_admin_reset_targets", {
        p_kind: searchKind,
        p_query: query.trim(),
      });
      if (result.error) throw result.error;
      setResults((result.data ?? []) as SearchTarget[]);
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo buscar."));
    }
    setBusy("");
  }

  async function prepareReset(scope: ResetScope, targetId: number | null = null) {
    setBusy(`preview-${scope}-${targetId ?? "all"}`);
    setPreview(null);
    setConfirmation("");
    setFinalArmed(false);
    try {
      const result = await client.rpc("preview_admin_data_reset", {
        p_scope: scope,
        p_target_id: targetId,
      });
      if (result.error) throw result.error;
      setPreview(result.data as ResetPreview);
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo preparar el borrado."));
    }
    setBusy("");
  }

  async function downloadSafetyBackup() {
    setBusy("backup");
    try {
      const result = await client.rpc("export_data_bundle", { p_domain: "complete" });
      if (result.error) throw result.error;
      downloadBundle(result.data as CyaDataBundle, "json");
      setBackupReady(true);
      notify("Copia completa descargada. Ya puedes preparar un reinicio masivo.");
      await refresh();
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo crear la copia de seguridad."));
    }
    setBusy("");
  }

  async function applyReset() {
    if (!preview || !exactConfirmation || !finalArmed) return;
    setBusy("apply");
    try {
      const result = await client.rpc("apply_admin_data_reset", {
        p_job_id: preview.job_id,
        p_confirmation: confirmation,
      });
      if (result.error) throw result.error;
      const scope = preview.scope;
      const label = preview.target_label || preview.preview.scope_label;
      clearConfirmation();
      setResults([]);
      setSelected(null);
      setQuery("");
      if (scope === "operational" || scope === "full") setBackupReady(false);
      await refresh();
      notify(`Borrado completado: ${label}. Los datos derivados se recalcularán desde el estado actual.`);
    } catch (error) {
      notify(readableError(error instanceof Error ? error.message : "No se pudo completar el borrado."));
    }
    setBusy("");
  }

  return (
    <section className={styles.zone}>
      <header className={styles.zoneHead}>
        <div className={styles.zoneIcon}><Trash2 /></div>
        <div>
          <p>Borrado y reinicio</p>
          <h2>Limpiar datos de pruebas</h2>
          <span>Previsualiza el impacto, confirma por escrito y ejecuta el borrado de forma atómica.</span>
        </div>
      </header>

      <div className={styles.safety}>
        <ShieldAlert />
        <div>
          <strong>La infraestructura nunca se borra</strong>
          <span>Auth, acceso administrativo, roles, migraciones, catálogos base, configuración e integraciones quedan protegidos para que CYA Hub siga arrancando.</span>
        </div>
      </div>

      <article className={styles.block}>
        <div className={styles.blockHead}>
          <div>
            <p>Borrado selectivo</p>
            <h3>Buscar un registro concreto</h3>
          </div>
          <Search />
        </div>

        <div className={styles.kindSwitch}>
          <button type="button" className={searchKind === "person" ? styles.active : ""} onClick={() => { setSearchKind("person"); setResults([]); setSelected(null); clearConfirmation(); }}>Alumno / persona</button>
          <button type="button" className={searchKind === "teaching_content" ? styles.active : ""} onClick={() => { setSearchKind("teaching_content"); setResults([]); setSelected(null); clearConfirmation(); }}>Contenido pedagógico</button>
        </div>

        <div className={styles.searchRow}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void searchTargets(); }}
            placeholder={searchKind === "person" ? "Nombre, email o teléfono…" : "Corrección, explicación, ejercicio, secuencia…"}
          />
          <button type="button" disabled={busy === "search"} onClick={() => void searchTargets()}><Search /> {busy === "search" ? "Buscando…" : "Buscar"}</button>
        </div>

        {results.length ? (
          <div className={styles.results}>
            {results.map((item) => (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                className={selected?.id === item.id && selected.kind === item.kind ? styles.selected : ""}
                onClick={() => { setSelected(item); clearConfirmation(); }}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.subtype}{item.detail ? ` · ${item.detail}` : ""}</small>
                </span>
                {item.protected ? <b>Protegido</b> : <Trash2 />}
              </button>
            ))}
          </div>
        ) : null}

        {selected ? (
          <div className={styles.selectedTarget}>
            <div>
              <strong>{selected.label}</strong>
              <span>{selected.protected ? "Identidad de profesor/administrador: la ficha técnica no puede eliminarse." : "Se borrará este registro y sus datos dependientes no compartidos."}</span>
            </div>
            <button
              type="button"
              disabled={selected.protected || Boolean(busy)}
              onClick={() => void prepareReset(selected.kind, selected.id)}
            >
              <Trash2 /> Previsualizar borrado
            </button>
          </div>
        ) : null}
      </article>

      <article className={styles.block}>
        <div className={styles.blockHead}>
          <div>
            <p>Borrado por áreas</p>
            <h3>Vaciar un módulo completo</h3>
          </div>
          <RotateCcw />
        </div>
        <div className={styles.scopeGrid}>
          {scopes.filter((item) => !["operational", "full"].includes(item.scope)).map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.scope} disabled={Boolean(busy)} onClick={() => void prepareReset(item.scope)}>
                <Icon />
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </div>
      </article>

      <article className={`${styles.block} ${styles.resetBlock}`}>
        <div className={styles.blockHead}>
          <div>
            <p>Reinicio masivo</p>
            <h3>Empezar de nuevo</h3>
          </div>
          <DatabaseBackup />
        </div>

        <button type="button" className={styles.backupButton} disabled={Boolean(busy)} onClick={() => void downloadSafetyBackup()}>
          <DatabaseBackup />
          <span>
            <strong>{backupReady ? "Copia completa descargada" : "1. Descargar copia completa"}</strong>
            <small>{backupReady ? "La protección previa está preparada para esta sesión." : "Obligatoria antes de los dos reinicios masivos."}</small>
          </span>
          {backupReady ? <CheckCircle2 /> : null}
        </button>

        <div className={styles.massGrid}>
          {scopes.filter((item) => ["operational", "full"].includes(item.scope)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.scope}
                className={item.scope === "full" ? styles.fullReset : ""}
                disabled={!backupReady || Boolean(busy)}
                onClick={() => void prepareReset(item.scope)}
              >
                <Icon />
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </div>
      </article>

      {preview ? (
        <section className={styles.confirmPanel}>
          <header>
            <AlertTriangle />
            <div>
              <p>Previsualización obligatoria</p>
              <h3>{preview.target_label || preview.preview.scope_label}</h3>
              <span>La preparación caduca en 30 minutos. Todavía no se ha borrado nada.</span>
            </div>
          </header>

          <div className={styles.impact}>
            <strong>{preview.preview.total}</strong>
            <span>referencias/registros afectados según el alcance</span>
          </div>

          {previewCounts.length ? (
            <div className={styles.counts}>
              {previewCounts.map(([key, value]) => (
                <div key={key}><strong>{value}</strong><span>{countLabels[key] ?? key.replaceAll("_", " ")}</span></div>
              ))}
            </div>
          ) : <div className={styles.emptyImpact}>El alcance ya está vacío. Puedes cancelar esta preparación.</div>}

          <div className={styles.preserved}>
            <strong>Se conserva</strong>
            <span>{preview.preview.preserves.join(" · ")}</span>
          </div>

          <label className={styles.phrase}>
            <span>Primera confirmación: escribe exactamente</span>
            <code>{preview.confirmation_phrase}</code>
            <input
              value={confirmation}
              onChange={(event) => { setConfirmation(event.target.value.toUpperCase()); setFinalArmed(false); }}
              placeholder={preview.confirmation_phrase}
              autoComplete="off"
            />
          </label>

          {!finalArmed ? (
            <button type="button" className={styles.armButton} disabled={!exactConfirmation || Boolean(busy)} onClick={() => setFinalArmed(true)}>
              <AlertTriangle /> Continuar a confirmación final
            </button>
          ) : (
            <div className={styles.finalConfirm}>
              <ShieldAlert />
              <div>
                <strong>Confirmación final</strong>
                <span>Se ejecutará ahora el borrado de «{preview.target_label || preview.preview.scope_label}». Si una operación interna falla, PostgreSQL revierte la transacción completa.</span>
              </div>
              <button type="button" disabled={busy === "apply"} onClick={() => void applyReset()}>
                <Trash2 /> {busy === "apply" ? "Borrando…" : "Sí, borrar definitivamente"}
              </button>
            </div>
          )}

          <button type="button" className={styles.cancel} disabled={busy === "apply"} onClick={clearConfirmation}>Cancelar</button>
        </section>
      ) : null}
    </section>
  );
}
