"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, CircleUserRound, Clock3, Save, Settings2, Trash2, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import { RuntimeForm } from "./runtime-form";
import styles from "./account-pages.module.css";

type CommonProps = {
  client: SupabaseClient;
  identity: IdentityContext;
  onIdentityPatch: (patch: Partial<IdentityContext>) => void;
  notify: (message: string) => void;
};

type ProfileProps = CommonProps;

type PreferencesProps = CommonProps & {
  experience: ExperienceContext;
};

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const AVATAR_EDGE = 1200;

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function avatarStoragePath(url: string | null | undefined, userId: string) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  const raw = url.slice(markerIndex + marker.length).split("?")[0];
  const decoded = decodeURIComponent(raw);
  return decoded.startsWith(`${userId}/`) ? decoded : null;
}

async function imageElement(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La imagen original es demasiado grande. Elige una de menos de 25 MB.");

  const image = await imageElement(file);
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, AVATAR_EDGE / Math.max(1, longest));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("No se pudo preparar la imagen.");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

function ProfileAvatar({ src, name }: { src: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const visibleSrc = src && failedSrc !== src ? src : null;
  return (
    <span className={styles.avatar} aria-label={`Foto de ${name || "perfil"}`}>
      {visibleSrc ? <img src={visibleSrc} alt="" onError={() => setFailedSrc(visibleSrc)} /> : <CircleUserRound />}
    </span>
  );
}

export function ProfileSettingsView({ client, identity, onIdentityPatch, notify }: ProfileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(identity.profile_name || identity.display_name);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(identity.avatar_url ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    let alive = true;
    client.from("user_profiles").select("display_name,avatar_url").eq("id", identity.user_id).maybeSingle().then(({ data, error: loadError }) => {
      if (!alive || loadError || !data) return;
      setDisplayName(data.display_name || identity.profile_name || identity.display_name);
      setCurrentAvatar(data.avatar_url || null);
      onIdentityPatch({ profile_name: data.display_name || identity.profile_name, avatar_url: data.avatar_url || null });
    });
    return () => { alive = false; };
  }, [client, identity.display_name, identity.profile_name, identity.user_id, onIdentityPatch]);

  const shownAvatar = removeAvatar ? null : previewUrl || currentAvatar;

  async function chooseFile(selected: File | null) {
    if (!selected) return;
    setError("");
    try {
      const prepared = await prepareAvatar(selected);
      setFile(prepared);
      setRemoveAvatar(false);
    } catch (cause) {
      setFile(null);
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la imagen.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return setError("El nombre del perfil no puede quedar vacío.");
    setBusy(true);
    setError("");

    const previousPath = avatarStoragePath(currentAvatar, identity.user_id);
    let uploadedPath: string | null = null;
    let nextAvatar = removeAvatar ? null : currentAvatar;

    try {
      if (file) {
        uploadedPath = `${identity.user_id}/avatar-${Date.now()}.jpg`;
        const upload = await client.storage.from("avatars").upload(uploadedPath, file, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false,
        });
        if (upload.error) throw upload.error;
        nextAvatar = client.storage.from("avatars").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const update = await client.from("user_profiles").update({
        display_name: name,
        avatar_url: nextAvatar,
      }).eq("id", identity.user_id);
      if (update.error) throw update.error;

      if (previousPath && (removeAvatar || uploadedPath)) {
        await client.storage.from("avatars").remove([previousPath]);
      }

      setCurrentAvatar(nextAvatar);
      setFile(null);
      setRemoveAvatar(false);
      onIdentityPatch({ profile_name: name, avatar_url: nextAvatar });
      notify("Perfil actualizado.");
    } catch (cause) {
      if (uploadedPath) await client.storage.from("avatars").remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el perfil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="profile-settings-title">
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>Mi cuenta</span>
        <h1 id="profile-settings-title">Editar perfil</h1>
        <p>Gestiona tu cuenta y, si eres alumno, tus datos personales canónicos.</p>
      </header>

      <form className={styles.card} onSubmit={submit}>
        <div className={styles.photoSection}>
          <ProfileAvatar src={shownAvatar} name={displayName} />
          <div className={styles.photoActions}>
            <strong>Foto de perfil</strong>
            <span>Elige una foto desde el iPhone.</span>
            <div>
              <button type="button" className={styles.secondaryButton} onClick={() => inputRef.current?.click()} disabled={busy}><Camera /> {shownAvatar ? "Cambiar foto" : "Subir foto"}</button>
              {shownAvatar ? <button type="button" className={styles.dangerButton} onClick={() => { setFile(null); setRemoveAvatar(true); }} disabled={busy}><Trash2 /> Eliminar</button> : null}
            </div>
            <input ref={inputRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
          </div>
        </div>

        <label className={styles.field}>
          <span>Nombre del perfil</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
          <small>Es el nombre que se muestra en la cabecera y en tu cuenta.</small>
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}><button className={styles.primaryButton} disabled={busy}><Save /> {busy ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>

      {identity.can_study ? <section className={styles.card} aria-labelledby="student-profile-data-title">
        <div className={styles.sectionTitle}><UserRound /><div><strong id="student-profile-data-title">Mis datos de alumno</strong><span>Información compartida con tu ficha CYA, sin volver a escribir lo que ya conocemos.</span></div></div>
        <RuntimeForm client={client} formKey="student_personal" mode="edit" submitLabel="Guardar datos de alumno" compact onSaved={() => notify("Datos de alumno actualizados.")} />
      </section> : null}
    </section>
  );
}

export function PreferencesSettingsView({ client, identity, experience, onIdentityPatch, notify }: PreferencesProps) {
  const [timezone, setTimezone] = useState(identity.timezone || "Europe/Madrid");
  const [morning, setMorning] = useState(identity.greeting_boundaries.morning_start || "05:00");
  const [afternoon, setAfternoon] = useState(identity.greeting_boundaries.afternoon_start || "12:00");
  const [night, setNight] = useState(identity.greeting_boundaries.night_start || "20:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    client.from("user_preferences").select("timezone,greeting_boundaries").eq("user_id", identity.user_id).maybeSingle().then(({ data, error: loadError }) => {
      if (!alive || loadError || !data) return;
      const boundaries = data.greeting_boundaries as Record<string, string> | null;
      setTimezone(data.timezone || identity.timezone || "Europe/Madrid");
      setMorning(boundaries?.morning_start || "05:00");
      setAfternoon(boundaries?.afternoon_start || "12:00");
      setNight(boundaries?.night_start || "20:00");
    });
    return () => { alive = false; };
  }, [client, identity.timezone, identity.user_id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validTimezone(timezone.trim())) return setError("La zona horaria no es válida. Ejemplo: Europe/Madrid.");
    const greetingBoundaries = { morning_start: morning, afternoon_start: afternoon, night_start: night };
    setBusy(true);
    setError("");
    const result = await client.from("user_preferences").upsert({
      user_id: identity.user_id,
      timezone: timezone.trim(),
      greeting_boundaries: greetingBoundaries,
      preferred_context: experience,
    }, { onConflict: "user_id" });
    setBusy(false);
    if (result.error) return setError(result.error.message);
    onIdentityPatch({ timezone: timezone.trim(), greeting_boundaries: greetingBoundaries });
    notify("Preferencias guardadas.");
  }

  return (
    <section className={styles.page} aria-labelledby="preferences-settings-title">
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>Mi cuenta</span>
        <h1 id="preferences-settings-title">Preferencias</h1>
        <p>Ajusta tu zona horaria y los saludos de Inicio.</p>
      </header>

      <form className={styles.card} onSubmit={submit}>
        <div className={styles.sectionTitle}><Settings2 /><div><strong>General</strong><span>Horario y comportamiento personal</span></div></div>
        <label className={styles.field}>
          <span>Zona horaria</span>
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Europe/Madrid" />
          <small>Se utiliza para agenda, clases, misiones y saludos.</small>
        </label>

        <div className={styles.sectionTitle}><Clock3 /><div><strong>Saludos</strong><span>Cuándo cambia el saludo de Inicio</span></div></div>
        <div className={styles.timeGrid}>
          <label className={styles.field}><span>Buenos días desde</span><input type="time" value={morning} onChange={(event) => setMorning(event.target.value)} /></label>
          <label className={styles.field}><span>Buenas tardes desde</span><input type="time" value={afternoon} onChange={(event) => setAfternoon(event.target.value)} /></label>
          <label className={styles.field}><span>Buenas noches desde</span><input type="time" value={night} onChange={(event) => setNight(event.target.value)} /></label>
        </div>

        <div className={styles.portalSummary}><UserRound /><div><strong>Portal preferido actual</strong><span>{experience === "admin" ? "Administrador" : experience === "student" ? "Alumno" : "Profesor"}</span></div></div>

        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}><button className={styles.primaryButton} disabled={busy}><Save /> {busy ? "Guardando…" : "Guardar preferencias"}</button></div>
      </form>
    </section>
  );
}
