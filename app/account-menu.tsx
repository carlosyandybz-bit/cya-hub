"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  LogOut,
  Pencil,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import styles from "./account-menu.module.css";

type AccountMenuProps = {
  client: SupabaseClient;
  identity: IdentityContext;
  experience: ExperienceContext;
  email: string;
  variant?: "header" | "sidebar";
  onExperience: (value: ExperienceContext) => void | Promise<void>;
  onIdentityPatch: (patch: Partial<IdentityContext>) => void;
  notify: (message: string) => void;
};

type DialogMode = "profile" | "preferences" | "account" | null;

type ProfileState = {
  display_name: string;
  avatar_url: string;
};

type PreferencesState = {
  timezone: string;
  greeting_boundaries: {
    morning_start: string;
    afternoon_start: string;
    night_start: string;
  };
  preferred_context: ExperienceContext | null;
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

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function PortalIcon({ value }: { value: ExperienceContext }) {
  if (value === "admin") return <ShieldCheck />;
  if (value === "student") return <UserRound />;
  return <UsersRound />;
}

export function AccountMenu({
  client,
  identity,
  experience,
  email,
  variant = "header",
  onExperience,
  onIdentityPatch,
  notify,
}: AccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    display_name: identity.profile_name || identity.display_name,
    avatar_url: "",
  });
  const [preferences, setPreferences] = useState<PreferencesState>({
    timezone: identity.timezone || "Europe/Madrid",
    greeting_boundaries: {
      morning_start: identity.greeting_boundaries.morning_start || "05:00",
      afternoon_start: identity.greeting_boundaries.afternoon_start || "12:00",
      night_start: identity.greeting_boundaries.night_start || "20:00",
    },
    preferred_context: experience,
  });

  const contexts = useMemo(() => {
    const values: ExperienceContext[] = [];
    if (identity.can_teach) values.push("teacher");
    if (identity.can_study) values.push("student");
    if (identity.can_admin) values.push("admin");
    return values;
  }, [identity.can_admin, identity.can_study, identity.can_teach]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [profileResult, preferenceResult] = await Promise.all([
        client.from("user_profiles").select("display_name,avatar_url").eq("id", identity.user_id).maybeSingle(),
        client.from("user_preferences").select("timezone,greeting_boundaries,preferred_context").eq("user_id", identity.user_id).maybeSingle(),
      ]);
      if (!alive) return;
      if (!profileResult.error && profileResult.data) {
        setProfile({
          display_name: profileResult.data.display_name || identity.profile_name || identity.display_name,
          avatar_url: profileResult.data.avatar_url || "",
        });
        setAvatarFailed(false);
      }
      if (!preferenceResult.error && preferenceResult.data) {
        const boundaries = preferenceResult.data.greeting_boundaries as Record<string, string> | null;
        setPreferences({
          timezone: preferenceResult.data.timezone || identity.timezone || "Europe/Madrid",
          greeting_boundaries: {
            morning_start: boundaries?.morning_start || "05:00",
            afternoon_start: boundaries?.afternoon_start || "12:00",
            night_start: boundaries?.night_start || "20:00",
          },
          preferred_context: (preferenceResult.data.preferred_context as ExperienceContext | null) ?? experience,
        });
      }
    }
    void load();
    return () => { alive = false; };
  }, [client, experience, identity.display_name, identity.profile_name, identity.timezone, identity.user_id]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPortalOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dialog) setDialog(null);
        else {
          setOpen(false);
          setPortalOpen(false);
        }
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [dialog]);

  const displayName = profile.display_name || identity.profile_name || identity.display_name;
  const showAvatarImage = Boolean(profile.avatar_url && !avatarFailed);

  function avatar(className?: string) {
    return (
      <span className={`${styles.avatar} ${className ?? ""}`} aria-hidden="true">
        {showAvatarImage ? <img src={profile.avatar_url} alt="" onError={() => setAvatarFailed(true)} /> : <CircleUserRound />}
      </span>
    );
  }

  function openDialog(mode: Exclude<DialogMode, null>) {
    setError("");
    setOpen(false);
    setPortalOpen(false);
    setDialog(mode);
  }

  async function changePortal(value: ExperienceContext) {
    if (value === experience) {
      setOpen(false);
      setPortalOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onExperience(value);
      setPreferences((current) => ({ ...current, preferred_context: value }));
      setOpen(false);
      setPortalOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayNameValue = String(form.get("display_name") || "").trim();
    const avatarUrlValue = String(form.get("avatar_url") || "").trim();
    if (!displayNameValue) {
      setError("El nombre del perfil no puede quedar vacío.");
      return;
    }
    if (avatarUrlValue) {
      try {
        const parsed = new URL(avatarUrlValue);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error("protocol");
      } catch {
        setError("La foto necesita una URL válida http o https.");
        return;
      }
    }
    setBusy(true);
    setError("");
    const result = await client.from("user_profiles").update({
      display_name: displayNameValue,
      avatar_url: avatarUrlValue || null,
    }).eq("id", identity.user_id);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setProfile({ display_name: displayNameValue, avatar_url: avatarUrlValue });
    setAvatarFailed(false);
    onIdentityPatch({ profile_name: displayNameValue });
    setDialog(null);
    notify("Perfil actualizado.");
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timezone = String(form.get("timezone") || "").trim();
    const greetingBoundaries = {
      morning_start: String(form.get("morning_start") || "05:00"),
      afternoon_start: String(form.get("afternoon_start") || "12:00"),
      night_start: String(form.get("night_start") || "20:00"),
    };
    if (!validTimezone(timezone)) {
      setError("La zona horaria no es válida. Ejemplo: Europe/Madrid.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await client.from("user_preferences").upsert({
      user_id: identity.user_id,
      timezone,
      greeting_boundaries: greetingBoundaries,
      preferred_context: preferences.preferred_context ?? experience,
    }, { onConflict: "user_id" });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPreferences((current) => ({ ...current, timezone, greeting_boundaries: greetingBoundaries }));
    onIdentityPatch({ timezone, greeting_boundaries: greetingBoundaries });
    setDialog(null);
    notify("Preferencias guardadas.");
  }

  async function signOut() {
    setBusy(true);
    await client.auth.signOut();
    setBusy(false);
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${variant === "sidebar" ? styles.sidebarRoot : styles.headerRoot}`}>
      {variant === "sidebar" ? (
        <button
          type="button"
          className={styles.sidebarTrigger}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {avatar(styles.sidebarAvatar)}
          <span className={styles.sidebarIdentity}>
            <strong>{displayName}</strong>
            <small>{contextLabels[experience]}</small>
          </span>
          <ChevronRight className={open ? styles.chevronOpen : ""} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.headerTrigger}
          aria-label="Abrir cuenta y preferencias"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {avatar()}
        </button>
      )}

      {open ? (
        <div className={`${styles.menu} ${variant === "sidebar" ? styles.menuSidebar : styles.menuHeader}`} role="menu" aria-label="Cuenta CYA">
          <div className={styles.menuIdentity}>
            {avatar(styles.menuAvatar)}
            <div>
              <strong>{displayName}</strong>
              <span>{email || "Cuenta CYA"}</span>
            </div>
          </div>

          <div className={styles.portalBlock}>
            <button
              type="button"
              className={styles.menuRow}
              onClick={() => setPortalOpen((value) => !value)}
              aria-expanded={portalOpen}
            >
              <span className={styles.rowIcon}><PortalIcon value={experience} /></span>
              <span className={styles.rowText}><strong>Cambiar de portal</strong><small>{contextLabels[experience]}</small></span>
              <ChevronRight className={portalOpen ? styles.chevronOpen : ""} />
            </button>
            {portalOpen ? (
              <div className={styles.portalOptions}>
                {contexts.map((context) => (
                  <button key={context} type="button" disabled={busy} onClick={() => void changePortal(context)}>
                    <PortalIcon value={context} />
                    <span>{contextLabels[context]}</span>
                    {experience === context ? <Check /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.separator} />
          <button type="button" className={styles.menuRow} onClick={() => openDialog("profile")}>
            <span className={styles.rowIcon}><Pencil /></span>
            <span className={styles.rowText}><strong>Editar perfil</strong><small>Nombre y avatar</small></span>
          </button>
          <button type="button" className={styles.menuRow} onClick={() => openDialog("preferences")}>
            <span className={styles.rowIcon}><Settings2 /></span>
            <span className={styles.rowText}><strong>Preferencias</strong><small>Zona horaria y saludos</small></span>
          </button>
          <button type="button" className={styles.menuRow} onClick={() => openDialog("account")}>
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

      {dialog ? (
        <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`account-${dialog}-title`}>
            <header className={styles.dialogHeader}>
              <div>
                <span>Mi cuenta</span>
                <h2 id={`account-${dialog}-title`}>
                  {dialog === "profile" ? "Editar perfil" : dialog === "preferences" ? "Preferencias" : "Cuenta y sesión"}
                </h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDialog(null)} aria-label="Cerrar"><X /></button>
            </header>

            {dialog === "profile" ? (
              <form className={styles.dialogBody} onSubmit={saveProfile}>
                <div className={styles.profilePreview}>{avatar(styles.previewAvatar)}<div><strong>{profile.display_name || identity.profile_name}</strong><span>{contextLabels[experience]}</span></div></div>
                <label className={styles.field}><span>Nombre del perfil</span><input name="display_name" defaultValue={profile.display_name} required /></label>
                <label className={styles.field}><span>Foto de perfil (URL)</span><input name="avatar_url" type="url" defaultValue={profile.avatar_url} placeholder="https://…" /><small>CYA guarda la referencia, no el archivo de imagen.</small></label>
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setDialog(null)}>Cancelar</button><button className={styles.primaryButton} disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</button></div>
              </form>
            ) : null}

            {dialog === "preferences" ? (
              <form className={styles.dialogBody} onSubmit={savePreferences}>
                <label className={styles.field}><span>Zona horaria</span><input name="timezone" defaultValue={preferences.timezone} placeholder="Europe/Madrid" /><small>Se utiliza para agenda, saludos y horarios.</small></label>
                <div className={styles.timeGrid}>
                  <label className={styles.field}><span>Buenos días desde</span><input name="morning_start" type="time" defaultValue={preferences.greeting_boundaries.morning_start} /></label>
                  <label className={styles.field}><span>Buenas tardes desde</span><input name="afternoon_start" type="time" defaultValue={preferences.greeting_boundaries.afternoon_start} /></label>
                  <label className={styles.field}><span>Buenas noches desde</span><input name="night_start" type="time" defaultValue={preferences.greeting_boundaries.night_start} /></label>
                </div>
                <div className={styles.preferenceSummary}><Clock3 /><div><strong>Portal preferido</strong><span>{contextLabels[preferences.preferred_context ?? experience]}. Se actualiza al cambiar de portal desde el avatar.</span></div></div>
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setDialog(null)}>Cancelar</button><button className={styles.primaryButton} disabled={busy}>{busy ? "Guardando…" : "Guardar preferencias"}</button></div>
              </form>
            ) : null}

            {dialog === "account" ? (
              <div className={styles.dialogBody}>
                <div className={styles.accountRows}>
                  <div><span>Email</span><strong>{email || "Sin email disponible"}</strong></div>
                  <div><span>Portal activo</span><strong>{contextLabels[experience]}</strong></div>
                  <div><span>Permisos</span><strong>{identity.roles.map((role) => roleLabels[role] ?? role).join(" · ")}</strong></div>
                </div>
                <p className={styles.accountNote}>Cambiar de portal modifica únicamente la vista. Tus permisos reales se mantienen.</p>
                <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setDialog(null)}>Cerrar</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void signOut()}><LogOut /> Cerrar sesión</button></div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
