"use client";

import { ChevronRight, Image as ImageIcon, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { SecureDriveAsset } from "./drive-media";
import styles from "./teaching-content-card.module.css";

export type TeachingCardMedia = {
  id?: number;
  media_type: "video" | "image";
  provider: string;
  external_file_id: string;
  title: string | null;
  mime_type?: string | null;
  group_label?: string | null;
  is_cover?: boolean;
  is_preview?: boolean;
  display_in_resources?: boolean;
  thumbnail_external_file_id?: string | null;
  thumbnail_mime_type?: string | null;
  preview_start_seconds?: number | null;
  preview_end_seconds?: number | null;
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

function placeholderLabel(kindLabel: string) {
  return kindLabel.slice(0, 2).toLocaleUpperCase("es");
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
  const cover = media.find((item) => item.is_cover) ?? media.find((item) => item.media_type === "image") ?? media[0] ?? null;
  const preview = media.find((item) => item.is_preview && item.media_type === "video") ?? null;
  const collapsedMedia = preview ?? cover;
  const resources = media.filter((item) => item.display_in_resources !== false);
  const groups = useMemo(() => {
    const grouped = new Map<string, TeachingCardMedia[]>();
    resources.forEach((item) => {
      const label = item.group_label?.trim() || "Recursos";
      grouped.set(label, [...(grouped.get(label) ?? []), item]);
    });
    return [...grouped.entries()];
  }, [resources]);
  const hasDetails = Boolean(description || correctionGuidance || resources.length || metadata.length || tags.length || children);
  const toggle = () => setOpen((value) => !value);

  return <article className={`${styles.card} ${open ? styles.open : ""} ${className}`.trim()}>
    <div className={styles.collapsedRow}>
      <button type="button" className={styles.visualButton} onClick={toggle} aria-label={`${open ? "Ocultar" : "Ver"} información de ${title}`} aria-expanded={open}>
        <div className={styles.visualFrame}>
          {collapsedMedia ? <SecureDriveAsset
            fileId={collapsedMedia.external_file_id}
            mediaType={collapsedMedia.media_type}
            title={collapsedMedia.title || title}
            thumbnailFileId={collapsedMedia.thumbnail_external_file_id}
            autoPreview={Boolean(preview && collapsedMedia.external_file_id === preview.external_file_id)}
            className={styles.coverAsset}
          /> : <div className={styles.visualPlaceholder}><span>{placeholderLabel(kindLabel)}</span><small>Sin portada</small></div>}
          {collapsedMedia ? <span className={styles.mediaTypeBadge}>{collapsedMedia.media_type === "video" ? <Video /> : <ImageIcon />}</span> : null}
        </div>
      </button>

      <div className={styles.collapsedInfo}>
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
      </div>
    </div>

    {open ? <section className={styles.details} aria-label={`Información de ${title}`}>
      {metadata.length ? <div className={styles.metaGrid}>{metadata.map((item) => <div key={`${item.label}-${item.value}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div> : null}
      {description ? <div className={styles.textBlock}><span>Explicación</span><p>{description}</p></div> : null}
      {correctionGuidance ? <div className={styles.textBlock}><span>Cómo se corrige</span><p>{correctionGuidance}</p></div> : null}
      {tags.length ? <div className={styles.tagBlock}><span>Etiquetas</span><div>{tags.map((tag) => <b key={tag}>{tag}</b>)}</div></div> : null}
      {children}

      {groups.map(([group, items]) => <section className={styles.resourceGroup} key={group}>
        <header><span>{group}</span><b>{items.length}</b></header>
        <div className={styles.resourceGrid}>{items.map((item, index) => <article key={`${item.external_file_id}-${index}`} className={styles.resourceCard}>
          <div className={styles.resourceMedia}><SecureDriveAsset
            fileId={item.external_file_id}
            mediaType={item.media_type}
            title={item.title || group}
            thumbnailFileId={item.thumbnail_external_file_id}
            controls={item.media_type === "video"}
            className={styles.resourceAsset}
          /></div>
          <div className={styles.resourceCaption}>{item.media_type === "video" ? <Video /> : <ImageIcon />}<strong>{item.title || (item.media_type === "video" ? "Vídeo" : "Imagen")}</strong></div>
        </article>)}</div>
      </section>)}

      {!hasDetails ? <p className={styles.empty}>{emptyText}</p> : null}
    </section> : null}
  </article>;
}
