from pathlib import Path

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

old_drive = '''function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}
'''
new_drive = '''function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function drivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}
'''
if old_drive not in text:
    raise SystemExit("driveFileUrl block not found")
text = text.replace(old_drive, new_drive, 1)

old_state = '''  const [editing,setEditing] = useState<TeachingContent|null>(null), [creating,setCreating] = useState(false), [relating,setRelating] = useState<TeachingContent|null>(null), [assigning,setAssigning] = useState<Person|null>(null), [studentQuery,setStudentQuery] = useState("");
'''
new_state = '''  const [editing,setEditing] = useState<TeachingContent|null>(null), [creating,setCreating] = useState(false), [relating,setRelating] = useState<TeachingContent|null>(null), [assigning,setAssigning] = useState<Person|null>(null), [studentQuery,setStudentQuery] = useState(""), [expandedContentId,setExpandedContentId] = useState<number|null>(null);
'''
if old_state not in text:
    raise SystemExit("TeachingView state line not found")
text = text.replace(old_state, new_state, 1)

old_render = '''  const renderContent = (content: TeachingContent) => <article className="teaching-row" key={content.id}><div className="teaching-row-main"><span className="content-kind">{teachingKindLabels[content.content_type]}</span><strong>{content.title}</strong><span>{linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · {linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · {linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}</span>{content.teaching_content_tags.length ? <small><Tag /> {content.teaching_content_tags.map((tag) => tag.tag).join(" · ")}</small> : null}</div><div className="teaching-row-actions">{content.teaching_content_media.length ? <span className="media-count"><Video />{content.teaching_content_media.length}</span> : null}<span className={`badge ${content.completion_status === "complete" ? "portal" : ""}`}>{content.completion_status === "complete" ? "Publicada" : "Incompleta"}</span><button className="icon-btn" onClick={() => setRelating(content)} aria-label="Relaciones"><Link2 /></button><button className="icon-btn" onClick={() => setEditing(content)} aria-label="Editar"><Pencil /></button></div></article>;
'''
new_render = '''  const renderContent = (content: TeachingContent) => {
    const isExpanded = expandedContentId === content.id;
    const category = terms.find((term) => term.id === content.category_term_id)?.label ?? "Sin categoría";
    const primaryMedia = content.teaching_content_media.find((media) => media.media_type === "video") ?? content.teaching_content_media[0] ?? null;
    const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);
    const measurementLabel = ({ frequency: "Frecuencia", importance: "Importancia", both: "Frecuencia + importancia", none: "Sin medición" } as Record<string,string>)[content.measurement_mode] ?? content.measurement_mode;
    const visibilityLabel = content.visibility === "student" ? "Visible para el alumno" : "Solo profesores";
    const publicationLabel = content.publication_status === "published" ? "Publicada" : content.publication_status === "archived" ? "Archivada" : "Borrador";
    return <article className="teaching-row" key={content.id} style={{ display:"grid", alignItems:"stretch", gap:12 }}>
      {primaryMedia ? <div style={{ width:"min(100%, 390px)", aspectRatio:"16 / 9", overflow:"hidden", borderRadius:14, border:"1px solid #e8e5ee", background:"#f4f2f6" }}>
        <iframe title={primaryMedia.title || `${teachingKindLabels[content.content_type]} · ${content.title}`} src={drivePreviewUrl(primaryMedia.external_file_id)} loading="lazy" allow="autoplay; fullscreen" allowFullScreen style={{ width:"100%", height:"100%", border:0, display:"block" }} />
      </div> : null}
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) auto", alignItems:"center", gap:10 }}>
        <div className="teaching-row-main"><span className="content-kind">{teachingKindLabels[content.content_type]}</span><strong>{content.title}</strong><span>{linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · {linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · {linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}</span>{content.teaching_content_tags.length ? <small><Tag /> {content.teaching_content_tags.map((tag) => tag.tag).join(" · ")}</small> : null}</div>
        <div className="teaching-row-actions"><span className={`badge ${content.completion_status === "complete" ? "portal" : ""}`}>{content.completion_status === "complete" ? "Publicada" : "Incompleta"}</span><button className="icon-btn" onClick={() => setRelating(content)} aria-label={`Relaciones de ${content.title}`} title="Relaciones"><Link2 /></button><button className="icon-btn" onClick={() => setEditing(content)} aria-label={`Editar ${content.title}`} title="Editar"><Pencil /></button></div>
      </div>
      <button type="button" className="btn ghost" onClick={() => setExpandedContentId(isExpanded ? null : content.id)} aria-expanded={isExpanded} style={{ width:"100%", minHeight:40, justifyContent:"space-between", padding:"0 12px", fontSize:12 }}><span>{isExpanded ? "Ocultar información" : "Ver información"}</span><ChevronRight size={17} style={{ transform:isExpanded ? "rotate(90deg)" : "none", transition:"transform .15s" }} /></button>
      {isExpanded ? <section aria-label={`Información de ${content.title}`} style={{ display:"grid", gap:14, padding:"14px", border:"1px solid #eeeaf3", borderRadius:14, background:"#faf9fc" }}>
        <div className="detail-grid">
          <div><span>Tipo</span><strong>{teachingKindLabels[content.content_type]}</strong></div>
          <div><span>Categoría</span><strong>{category}</strong></div>
          <div><span>Estado</span><strong>{publicationLabel}</strong></div>
          <div><span>Visibilidad</span><strong>{visibilityLabel}</strong></div>
          {content.content_type === "correction" ? <div><span>Medición</span><strong>{measurementLabel}</strong></div> : null}
          <div><span>Estilos</span><strong>{linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)}</strong></div>
          <div><span>Roles</span><strong>{linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)}</strong></div>
          <div><span>Niveles</span><strong>{linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}</strong></div>
        </div>
        {content.description ? <div><span style={{ display:"block", marginBottom:5, color:"#777287", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Explicación</span><p style={{ margin:0, color:"#4e495b", lineHeight:1.55, whiteSpace:"pre-wrap" }}>{content.description}</p></div> : null}
        {content.correction_guidance ? <div><span style={{ display:"block", marginBottom:5, color:"#777287", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Cómo se corrige</span><p style={{ margin:0, color:"#4e495b", lineHeight:1.55, whiteSpace:"pre-wrap" }}>{content.correction_guidance}</p></div> : null}
        {content.teaching_content_tags.length ? <div><span style={{ display:"block", marginBottom:7, color:"#777287", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Etiquetas</span><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{content.teaching_content_tags.map((tag) => <span className="badge" key={tag.tag}>{tag.tag}</span>)}</div></div> : null}
        {content.teaching_content_media.length ? <div><span style={{ display:"block", marginBottom:8, color:"#777287", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Fotos y vídeos</span><div style={{ display:"grid", gap:10 }}>{content.teaching_content_media.map((media) => <div key={media.id} style={{ display:"grid", gap:7 }}><div style={{ width:"min(100%, 560px)", aspectRatio:"16 / 9", overflow:"hidden", borderRadius:12, border:"1px solid #e8e5ee", background:"white" }}><iframe title={media.title || (media.media_type === "video" ? "Vídeo" : "Imagen")} src={drivePreviewUrl(media.external_file_id)} loading="lazy" allow="autoplay; fullscreen" allowFullScreen style={{ width:"100%", height:"100%", border:0, display:"block" }} /></div><a className="btn ghost" href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer" style={{ width:"max-content", minHeight:38, fontSize:11 }}>{media.media_type === "video" ? <Video size={16} /> : <ImageIcon size={16} />}{media.title || (media.media_type === "video" ? "Abrir vídeo en Drive" : "Abrir imagen en Drive")}<ExternalLink size={14} /></a></div>)}</div></div> : null}
        {ownRelations.length ? <div><span style={{ display:"block", marginBottom:7, color:"#777287", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Relaciones</span><div style={{ display:"grid", gap:6 }}>{ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"9px 10px", border:"1px solid #e8e5ee", borderRadius:10, background:"white" }}><span style={{ color:"#777287", fontSize:11 }}>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong style={{ fontSize:12, textAlign:"right" }}>{other?.title ?? "Contenido archivado"}</strong></div>; })}</div></div> : null}
        {!content.description && !content.correction_guidance && !content.teaching_content_media.length && !ownRelations.length ? <div className="compact-empty"><BookOpen /><span>No hay información adicional guardada todavía.</span></div> : null}
      </section> : null}
    </article>;
  };
'''
if old_render not in text:
    raise SystemExit("TeachingView renderContent line not found")
text = text.replace(old_render, new_render, 1)

path.write_text(text, encoding="utf-8")
