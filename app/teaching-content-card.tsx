"use client";

import { ChevronRight, ExternalLink, Image as ImageIcon, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import styles from "./teaching-content-card.module.css";

export type TeachingCardMedia = {
  id?: number;
  media_type: "video" | "image";
  provider: string;
  external_file_id: string;
  title: string | null;
};

export type TeachingCardMeta = {
  label: string;
  value: string;
};

type Props = {
  kindLabel: string;
  title: string;
  subtitle?: string | null;
  statusLabel?: string | null;
  statusTone?: "default" | "success" | "warning";
  description?: string | null;
  correctionGuidance?: string | null;
  media?: TeachingCardMedia[];
  metadata?: TeachingCardMeta[];
  tags?: string[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  emptyText?: string;
};

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function driveContentUrl(fileId: string) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`;
}

function driveThumbnailUrl(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`;
}

function NativeDriveMedia({ item, compact = false }: { item: TeachingCardMedia; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const label = item.title || (item.media_type === "video" ? "Vídeo" : "Imagen");

  if (failed) {
    return <a className={`${styles.mediaFallback} ${compact ? styles.compactFallback : ""}`} href={driveFileUrl(item.external_file_id)} target="_blank" rel="noreferrer">
      {item.media_type === "video" ? <Video /> : <ImageIcon />}
      <span><strong>{label}</strong><small>No se puede cargar aquí. Abrir en Drive.</small></span>
      <ExternalLink />
    </a>;
  }

  if (item.media_type === "video") {
    return <video
      className={styles.nativeMedia}
      controls
      playsInline
      preload="metadata"
      poster={driveThumbnailUrl(item.external_file_id)}
      onError={() => setFailed(true)}
    >
      <source src={driveContentUrl(item.external_file_id)} />
    </video>;
  }

  return <img
    className={styles.nativeMedia}
    src={driveThumbnailUrl(item.external_file_id)}
    alt={label}
    loading="lazy"
    onError={() => setFailed(true)}
  />;
}

export function TeachingContentCard({
  kindLabel,
  title,
  subtitle,
  statusLabel,
  statusTone = "default",
  description,
  correctionGuidance,
  media = [],
  metadata = [],
  tags = [],
  actions,
  children,
  className = "",
  defaultOpen = false,
  emptyText = "No hay información adicional guardada todavía.",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const primaryMedia = media.find((item) => item.media_type === "video") ?? media[0] ?? null;
  const hasDetails = Boolean(description || correctionGuidance || media.length || metadata.length || tags.length || children);
  const toggle = () => setOpen((value) => !value);

  return <article className={`${styles.card} ${open ? styles.open : ""} ${className}`.trim()}>
    {primaryMedia ? <div className={styles.previewMedia}>
      <NativeDriveMedia item={primaryMedia} compact />
      <span className={styles.previewBadge}>{primaryMedia.media_type === "video" ? <Video /> : <ImageIcon />}{primaryMedia.title || (primaryMedia.media_type === "video" ? "Vídeo" : "Imagen")}</span>
    </div> : null}

    <div className={styles.head}>
      <button type="button" className={styles.mainButton} onClick={toggle} aria-expanded={open}>
        <span className={styles.kind}>{kindLabel}</span>
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </button>
      <div className={styles.side}>
        {statusLabel ? <span className={`${styles.status} ${statusTone === "success" ? styles.success : statusTone === "warning" ? styles.warning : ""}`}>{statusLabel}</span> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>

    <button type="button" className={styles.toggle} onClick={toggle} aria-expanded={open}>
      <span>{open ? "Ocultar información" : "Ver información"}</span>
      <ChevronRight className={open ? styles.chevronOpen : ""} />
    </button>

    {open ? <section className={styles.details} aria-label={`Información de ${title}`}>
      {metadata.length ? <div className={styles.metaGrid}>{metadata.map((item) => <div key={`${item.label}-${item.value}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div> : null}

      {description ? <div className={styles.textBlock}><span>Explicación</span><p>{description}</p></div> : null}
      {correctionGuidance ? <div className={styles.textBlock}><span>Cómo se corrige</span><p>{correctionGuidance}</p></div> : null}

      {tags.length ? <div className={styles.tagBlock}><span>Etiquetas</span><div>{tags.map((tag) => <b key={tag}>{tag}</b>)}</div></div> : null}

      {children}

      {media.length ? <div className={styles.mediaBlock}>
        <span>Fotos y vídeos</span>
        <div className={styles.mediaGrid}>{media.map((item, index) => <article key={`${item.external_file_id}-${index}`}>
          <div className={styles.mediaFrame}><NativeDriveMedia item={item} /></div>
          <a href={driveFileUrl(item.external_file_id)} target="_blank" rel="noreferrer">{item.media_type === "video" ? <Video /> : <ImageIcon />}<span>{item.title || (item.media_type === "video" ? "Abrir vídeo en Drive" : "Abrir imagen en Drive")}</span><ExternalLink /></a>
        </article>)}</div>
      </div> : null}

      {!hasDetails ? <p className={styles.empty}>{emptyText}</p> : null}
    </section> : null}
  </article>;
}
