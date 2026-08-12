"use client";

import { ChevronRight, Image as ImageIcon, Video, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

export type TeachingCardMeta = { label: string; value: string };

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
  quickControls?: ReactNode;
  detailControls?: ReactNode;
  kindTone?: "correction" | "explanation" | "exercise" | "sequence";
  children?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  emptyText?: string;
};

function canonicalMetadataValue(item: TeachingCardMeta) {
  return item.label === "Medición" && item.value === "Importancia" ? "Influencia" : item.value;
}

export function TeachingContentCard({
  kindLabel,title,subtitle,statusLabel,statusTone="default",description,correctionGuidance,
  media=[],metadata=[],tags=[],actions,quickControls,detailControls,kindTone,children,className="",defaultOpen=false,
  emptyText="No hay información adicional guardada todavía.",
}: Props) {
  const [open,setOpen]=useState(defaultOpen);
  const cover=media.find((item)=>item.is_cover) ?? media.find((item)=>item.media_type==="image") ?? media[0] ?? null;
  const preview=media.find((item)=>item.is_preview && item.media_type==="video") ?? null;
  const collapsedMedia=preview ?? cover;
  const primaryDetailMedia=preview ?? cover;
  const resources=media.filter((item)=>item.display_in_resources!==false);
  const groups=useMemo(()=>{
    const grouped=new Map<string,TeachingCardMedia[]>();
    resources.forEach((item)=>{const label=item.group_label?.trim() || "Recursos"; grouped.set(label,[...(grouped.get(label)??[]),item]);});
    return [...grouped.entries()];
  },[resources]);
  const hasDetails=Boolean(description || correctionGuidance || media.length || metadata.length || tags.length || detailControls || children);

  useEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    window.addEventListener("keydown",closeOnEscape);
    return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",closeOnEscape);};
  },[open]);

  const toneClass=kindTone==="correction"?styles.correction:kindTone==="explanation"?styles.explanation:kindTone==="exercise"?styles.exercise:kindTone==="sequence"?styles.sequence:"";

  return <article className={`${styles.card} ${toneClass} ${className}`.trim()}>
    <button type="button" className={`${styles.compactButton} ${collapsedMedia?styles.withMedia:""}`} onClick={()=>setOpen(true)} aria-label={`Abrir ${kindLabel}: ${title}`}>
      {collapsedMedia ? <span className={styles.miniMedia} aria-hidden="true"><SecureDriveAsset
        fileId={collapsedMedia.external_file_id}
        mediaType={collapsedMedia.media_type}
        title={collapsedMedia.title || title}
        thumbnailFileId={collapsedMedia.thumbnail_external_file_id}
        className={styles.miniAsset}
      /><span>{collapsedMedia.media_type==="video"?<Video/>:<ImageIcon/>}</span></span> : null}
      <span className={styles.compactInfo}>
        <span className={styles.topline}><span className={styles.kind}>{kindLabel}</span>{statusLabel?<span className={`${styles.status} ${statusTone==="success"?styles.success:statusTone==="warning"?styles.warning:""}`}>{statusLabel}</span>:null}</span>
        <strong>{title}</strong>
        {subtitle?<small>{subtitle}</small>:null}
        {quickControls?<span className={styles.quickControls}>{quickControls}</span>:null}
      </span>
      <span className={styles.trailing}>{actions?<span className={styles.actions} onClick={(event)=>event.stopPropagation()}>{actions}</span>:null}<ChevronRight/></span>
    </button>

    {open ? <div className={styles.detailBackdrop} onMouseDown={(event)=>event.target===event.currentTarget&&setOpen(false)}>
      <section className={styles.detailModal} role="dialog" aria-modal="true" aria-label={`${kindLabel}: ${title}`}>
        <header className={styles.detailHeader}>
          <div><span className={styles.detailKind}>{kindLabel}</span><h2>{title}</h2>{subtitle && !metadata.length?<p>{subtitle}</p>:null}</div>
          <div className={styles.detailHeaderActions}>{statusLabel?<span className={`${styles.status} ${statusTone==="success"?styles.success:statusTone==="warning"?styles.warning:""}`}>{statusLabel}</span>:null}<button type="button" className={styles.closeButton} onClick={()=>setOpen(false)} aria-label="Cerrar contenido"><X/></button></div>
        </header>
        <div className={styles.detailBody}>
          {detailControls ? <section className={styles.detailControls}>{detailControls}</section> : null}
          {primaryDetailMedia ? <div className={styles.detailHeroMedia}><SecureDriveAsset fileId={primaryDetailMedia.external_file_id} mediaType={primaryDetailMedia.media_type} title={primaryDetailMedia.title||title} thumbnailFileId={primaryDetailMedia.thumbnail_external_file_id} controls={primaryDetailMedia.media_type==="video"} className={styles.detailHeroAsset}/></div>:null}
          {metadata.length?<div className={styles.metaGrid}>{metadata.map((item)=>{const value=canonicalMetadataValue(item);return <div key={`${item.label}-${value}`}><span>{item.label}</span><strong>{value}</strong></div>;})}</div>:null}
          {description?<div className={styles.textBlock}><span>Explicación</span><p>{description}</p></div>:null}
          {correctionGuidance?<div className={styles.textBlock}><span>Cómo se corrige</span><p>{correctionGuidance}</p></div>:null}
          {tags.length?<div className={styles.tagBlock}><span>Etiquetas</span><div>{tags.map((tag)=><b key={tag}>{tag}</b>)}</div></div>:null}
          {children}
          {groups.map(([group,items])=><section className={styles.resourceGroup} key={group}><header><span>{group}</span><b>{items.length}</b></header><div className={styles.resourceGrid}>{items.map((item,index)=><article key={`${item.external_file_id}-${index}`} className={styles.resourceCard}><div className={styles.resourceMedia}><SecureDriveAsset fileId={item.external_file_id} mediaType={item.media_type} title={item.title||group} thumbnailFileId={item.thumbnail_external_file_id} controls={item.media_type==="video"} className={styles.resourceAsset}/></div><div className={styles.resourceCaption}>{item.media_type==="video"?<Video/>:<ImageIcon/>}<strong>{item.title||(item.media_type==="video"?"Vídeo":"Imagen")}</strong></div></article>)}</div></section>)}
          {!hasDetails?<p className={styles.empty}>{emptyText}</p>:null}
        </div>
      </section>
    </div>:null}
  </article>;
}
