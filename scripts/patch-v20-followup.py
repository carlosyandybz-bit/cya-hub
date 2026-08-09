from pathlib import Path

path = Path('app/teaching-graph.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'import { ArrowLeft, Crosshair, ExternalLink, GitBranch, Image as ImageIcon, RotateCcw, Search, Video, X } from "lucide-react";\n',
    'import { ArrowLeft, Crosshair, GitBranch, RotateCcw, Search, X } from "lucide-react";\n'
)
text = text.replace(
    'import { useEffect, useMemo, useState } from "react";\n',
    'import { useEffect, useMemo, useState } from "react";\nimport { SecureDriveAsset } from "./drive-media";\nimport type { TeachingCardMedia } from "./teaching-content-card";\n'
)
old_type = '  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; external_file_id: string; title: string | null }>;'
if old_type not in text:
    raise SystemExit('Graph media type not found')
text = text.replace(old_type, '  teaching_content_media: TeachingCardMedia[];', 1)

old_fn = '''function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

'''
if old_fn not in text:
    raise SystemExit('Graph Drive URL helper not found')
text = text.replace(old_fn, '', 1)

old_media = '''{selected.teaching_content_media.length ? <div className="graph-media"><strong>Multimedia</strong>{selected.teaching_content_media.map((media) => <a key={media.id} href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer">{media.media_type === "video" ? <Video /> : <ImageIcon />}<span>{media.title || (media.media_type === "video" ? "Ver vídeo" : "Ver imagen")}</span><ExternalLink /></a>)}</div> : null}'''
new_media = '''{selected.teaching_content_media.length ? <div className="graph-media"><strong>Multimedia</strong><div className="graph-media-grid">{selected.teaching_content_media.filter((media) => media.display_in_resources !== false).map((media) => <article key={media.id ?? media.external_file_id}><div className="graph-media-frame"><SecureDriveAsset fileId={media.external_file_id} mediaType={media.media_type} title={media.title} thumbnailFileId={media.thumbnail_external_file_id} controls={media.media_type === "video"} /></div><span>{media.title || (media.media_type === "video" ? "Vídeo" : "Imagen")}</span></article>)}</div></div> : null}'''
if old_media not in text:
    raise SystemExit('Graph media JSX not found')
text = text.replace(old_media, new_media, 1)
path.write_text(text, encoding='utf-8')
