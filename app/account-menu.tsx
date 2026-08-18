"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ChevronRight,
  CircleUserRound,
  Images,
  LogOut,
  Pencil,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExperienceSwitcher } from "./experience-switcher";
import { P31AppearanceRuntime } from "./p31-appearance-runtime";
import { StudentPersonalMediaOverlay } from "./student-personal-media";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import styles from "./account-menu.module.css";

type AccountMenuProps = {
  client: SupabaseClient;
  identity: IdentityContext;
  experience: ExperienceContext;
  email: string;
  variant?: "header" | "sidebar";
  onExperience: (value: ExperienceContext) => void | Promise<void>;
  onOpenProfile: () => void;
  onOpenPreferences: () => void;
  onIdentityPatch?: (patch: Partial<IdentityContext>) => void;
  notify: (message: string) => void;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  teacher_admin: "Profesor administrador",
  teacher: "Profesor",
  student: "Alumno",
};

const contextLabels: Record<ExperienceContext, string> = {
  teacher: "Profesor",
  student: "Alumno",
  admin: "Administrador",
};

export function AccountMenu({
  client,
  identity,
  experience,
  email,
  variant = "header",
  onExperience,
  onOpenProfile,
  onOpenPreferences,
}: AccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (mediaOpen) setMediaOpen(false);
      else if (accountOpen) setAccountOpen(false);
      else setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen, mediaOpen]);

  useEffect(() => {
    if (!accountOpen && !mediaOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [accountOpen, mediaOpen]);

  const displayName = identity.profile_name || identity.display_name;
  const showAvatarImage = Boolean(identity.avatar_url && identity.avatar_url !== failedAvatarUrl);

  function avatar(className?: string) {
    return (
      <span className={`${styles.avatar} ${className ?? ""}`} aria-hidden="true">
        {showAvatarImage ? <img src={identity.avatar_url ?? ""} alt="" onError={() => setFailedAvatarUrl(identity.avatar_url)} /> : <span className={styles.avatarSilhouette}><span className={styles.avatarHead} /><span className={styles.avatarShoulders} /></span>}
      </span>
    );
  }

  function openPage(callback: () => void) {
    setOpen(false);
    callback();
  }

  async function changeExperience(value: ExperienceContext) {
    if (value === experience) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await onExperience(value);
      window.dispatchEvent(new CustomEvent("cya:experience-change", { detail: value }));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await client.auth.signOut();
    setBusy(false);
  }

  return (
    <>
      <P31AppearanceRuntime />
      <div
        ref={rootRef}
        className={`${styles.root} ${variant === "sidebar" ? styles.sidebarRoot : styles.headerRoot}`}
        data-cya-account-menu
        data-experience={experience}
      >
        {variant === "sidebar" ? (
          <button type="button" className={styles.sidebarTrigger} aria-label="Abrir cuenta y preferencias" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {avatar(styles.sidebarAvatar)}
            <span className={styles.sidebarIdentity}><strong>{displayName}</strong><small>{contextLabels[experience]}</small></span>
            <ChevronRight className={open ? styles.chevronOpen : ""} />
          </button>
        ) : (
          <button type="button" className={styles.headerTrigger} aria-label="Abrir cuenta y preferencias" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {avatar()}
          </button>
        )}

        {open ? (
          <div className={`${styles.menu} ${variant === "sidebar" ? styles.menuSidebar : styles.menuHeader}`} role="menu" aria-label="Cuenta CYA">
            <div className={styles.menuIdentity}>
              {avatar(styles.menuAvatar)}
              <div><strong>{displayName}</strong><span>{email || "Cuenta CYA"}</span></div>
            </div>

            <ExperienceSwitcher identity={identity} experience={experience} busy={busy} onSelect={changeExperience} />

            <div className={styles.separator} />
            {experience === "student" && identity.person_id ? <button type="button" className={styles.menuRow} onClick={() => { setOpen(false); setMediaOpen(true); }}>
              <span className={styles.rowIcon}><Images /></span>
              <span className={styles.rowText}><strong>Mis archivos</strong><small>Fotos y vídeos compartidos directamente contigo</small></span>
              <ChevronRight />
            </button> : null}
            <button type="button" className={styles.menuRow} onClick={() => openPage(onOpenProfile)}>
              <span className={styles.rowIcon}><Pencil /></span>
              <span className={styles.rowText}><strong>Editar perfil</strong><small>Foto, nombre y datos personales</small></span>
              <ChevronRight />
            </button>
            <button type="button" className={styles.menuRow} onClick={() => openPage(onOpenPreferences)}>
              <span className={styles.rowIcon}><Settings /></span>
              <span className={styles.rowText}><strong>Preferencias</strong><small>Configuración personal de CYA Hub</small></span>
              <ChevronRight />
            </button>
            <button type="button" className={styles.menuRow} onClick={() => { setOpen(false); setAccountOpen(true); }}>
              <span className={styles.rowIcon}><CircleUserRound /></span>
              <span className={styles.rowText}><strong>Cuenta y sesión</strong><small>{identity.roles.map((role) => roleLabels[role] ?? role).join(" · ")}</small></span>
            </button>
            <div className={styles.separator} />
            <button type="button" className={`${styles.menuRow} ${styles.signOutRow}`} disabled={busy} onClick={() => void signOut()}>
              <span className={styles.rowIcon}><LogOut /></span>
              <span className={styles.rowText}><strong>Cerrar sesión</strong><small>Salir de este dispositivo</small></span>
            </button>
          </div>
        ) : null}

        {accountOpen && typeof document !== "undefined" ? createPortal(
          <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setAccountOpen(false)}>
            <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-session-title">
              <header className={styles.dialogHeader}>
                <div><span>Mi cuenta</span><h2 id="account-session-title">Cuenta y sesión</h2></div>
                <button type="button" className={styles.closeButton} onClick={() => setAccountOpen(false)} aria-label="Cerrar"><X /></button>
              </header>
              <div className={styles.dialogBody}>
                <div className={styles.accountRows}>
                  <div><span>Email</span><strong>{email || "Sin email disponible"}</strong></div>
                  <div><span>Vista activa</span><strong>{contextLabels[experience]}</strong></div>
                  <div><span>Permisos</span><strong>{identity.roles.map((role) => roleLabels[role] ?? role).join(" · ")}</strong></div>
                </div>
                <p className={styles.accountNote}>Cambiar de vista no cambia tus permisos reales.</p>
                <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setAccountOpen(false)}>Cerrar</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void signOut()}><LogOut /> Cerrar sesión</button></div>
              </div>
            </section>
          </div>,
          document.body,
        ) : null}
      </div>
      {mediaOpen && identity.person_id ? <StudentPersonalMediaOverlay close={() => setMediaOpen(false)} personId={identity.person_id} readOnly /> : null}
    </>
  );
}
