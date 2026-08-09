from pathlib import Path

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

old_media = '''      {primaryMedia ? <div style={{ width:"min(100%, 390px)", aspectRatio:"16 / 9", overflow:"hidden", borderRadius:14, border:"1px solid #e8e5ee", background:"#f4f2f6" }}>
        <iframe title={primaryMedia.title || `${teachingKindLabels[content.content_type]} · ${content.title}`} src={drivePreviewUrl(primaryMedia.external_file_id)} loading="lazy" allow="autoplay; fullscreen" allowFullScreen style={{ width:"100%", height:"100%", border:0, display:"block" }} />
      </div> : null}
'''
new_media = '''      {primaryMedia ? <button type="button" aria-label={`Ver información de ${content.title}`} onClick={() => setExpandedContentId(isExpanded ? null : content.id)} style={{ width:"min(100%, 390px)", aspectRatio:"16 / 9", overflow:"hidden", padding:0, borderRadius:14, border:"1px solid #e8e5ee", background:"#f4f2f6", cursor:"pointer", position:"relative", zIndex:1 }}>
        <iframe title={primaryMedia.title || `${teachingKindLabels[content.content_type]} · ${content.title}`} src={drivePreviewUrl(primaryMedia.external_file_id)} loading="lazy" tabIndex={-1} aria-hidden="true" style={{ width:"100%", height:"100%", border:0, display:"block", pointerEvents:"none" }} />
      </button> : null}
'''
if old_media not in text:
    raise SystemExit("collapsed media block not found")
text = text.replace(old_media, new_media, 1)

old_main = '''        <div className="teaching-row-main"><span className="content-kind">{teachingKindLabels[content.content_type]}</span><strong>{content.title}</strong><span>{linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · {linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · {linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}</span>{content.teaching_content_tags.length ? <small><Tag /> {content.teaching_content_tags.map((tag) => tag.tag).join(" · ")}</small> : null}</div>
'''
new_main = '''        <button type="button" className="teaching-row-main" onClick={() => setExpandedContentId(isExpanded ? null : content.id)} aria-expanded={isExpanded} style={{ width:"100%", minWidth:0, padding:0, border:0, background:"transparent", color:"inherit", textAlign:"left", cursor:"pointer" }}><span className="content-kind">{teachingKindLabels[content.content_type]}</span><strong>{content.title}</strong><span>{linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · {linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · {linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}</span>{content.teaching_content_tags.length ? <small><Tag /> {content.teaching_content_tags.map((tag) => tag.tag).join(" · ")}</small> : null}</button>
'''
if old_main not in text:
    raise SystemExit("teaching row main block not found")
text = text.replace(old_main, new_main, 1)

old_info = '''      <button type="button" className="btn ghost" onClick={() => setExpandedContentId(isExpanded ? null : content.id)} aria-expanded={isExpanded} style={{ width:"100%", minHeight:40, justifyContent:"space-between", padding:"0 12px", fontSize:12 }}><span>{isExpanded ? "Ocultar información" : "Ver información"}</span><ChevronRight size={17} style={{ transform:isExpanded ? "rotate(90deg)" : "none", transition:"transform .15s" }} /></button>
'''
new_info = '''      <button type="button" className="btn ghost" onClick={() => setExpandedContentId(isExpanded ? null : content.id)} aria-expanded={isExpanded} style={{ width:"100%", minHeight:44, justifyContent:"space-between", padding:"0 12px", fontSize:12, position:"relative", zIndex:2, touchAction:"manipulation" }}><span>{isExpanded ? "Ocultar información" : "Ver información"}</span><ChevronRight size={17} style={{ transform:isExpanded ? "rotate(90deg)" : "none", transition:"transform .15s" }} /></button>
'''
if old_info not in text:
    raise SystemExit("teaching info button not found")
text = text.replace(old_info, new_info, 1)

path.write_text(text, encoding="utf-8")
