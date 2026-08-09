from pathlib import Path

path = Path("app/cya-app.tsx")
text = path.read_text(encoding="utf-8")

old_filter = '''  const filtered = contents.filter((content) => content.active && content.content_type === kind).filter((content) => !query.trim() || [content.title,content.description,content.teaching_content_tags.map((tag) => tag.tag).join(" ")].some((value) => String(value || "").toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))));
'''
new_filter = '''  const filtered = contents.filter((content) => content.active && content.content_type === kind).filter((content) => !query.trim() || [content.title,content.description,content.correction_guidance,content.teaching_content_tags.map((tag) => tag.tag).join(" ")].some((value) => String(value || "").toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))));
'''
if old_filter in text:
    text = text.replace(old_filter, new_filter, 1)

text = text.replace(
    'style={{ display:"grid", alignItems:"stretch", gap:12 }}',
    'style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr)", alignItems:"stretch", gap:12 }}',
    1,
)

old_badge = '''<span className={`badge ${content.completion_status === "complete" ? "portal" : ""}`}>{content.completion_status === "complete" ? "Publicada" : "Incompleta"}</span>'''
new_badge = '''<span className={`badge ${content.publication_status === "published" ? "portal" : ""}`}>{content.publication_status === "published" ? "Publicada" : content.completion_status === "incomplete" ? "Incompleta" : "Borrador"}</span>'''
if old_badge in text:
    text = text.replace(old_badge, new_badge, 1)

path.write_text(text, encoding="utf-8")
