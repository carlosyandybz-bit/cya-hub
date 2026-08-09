from pathlib import Path
import re

app_path = Path("app/cya-app.tsx")
text = app_path.read_text(encoding="utf-8")

import_anchor = 'import { StudentMasterDetail } from "./student-detail";\n'
card_import = 'import { TeachingContentCard } from "./teaching-content-card";\n'
if card_import not in text:
    if import_anchor not in text:
        raise SystemExit("StudentMasterDetail import anchor not found")
    text = text.replace(import_anchor, import_anchor + card_import, 1)

old_state = '  const [editing,setEditing] = useState<TeachingContent|null>(null), [creating,setCreating] = useState(false), [relating,setRelating] = useState<TeachingContent|null>(null), [assigning,setAssigning] = useState<Person|null>(null), [studentQuery,setStudentQuery] = useState(""), [expandedContentId,setExpandedContentId] = useState<number|null>(null);'
new_state = '  const [editing,setEditing] = useState<TeachingContent|null>(null), [creating,setCreating] = useState(false), [relating,setRelating] = useState<TeachingContent|null>(null), [assigning,setAssigning] = useState<Person|null>(null), [studentQuery,setStudentQuery] = useState("");'
if old_state not in text:
    raise SystemExit("TeachingView state declaration not found")
text = text.replace(old_state, new_state, 1)

render_pattern = re.compile(r'  const renderContent = \(content: TeachingContent\) => \{.*?\n  \};\n  return <>', re.S)
render_replacement = '''  const renderContent = (content: TeachingContent) => {
    const category = terms.find((term) => term.id === content.category_term_id)?.label ?? "Sin categoría";
    const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);
    const measurementLabel = ({ frequency: "Frecuencia", importance: "Importancia", both: "Frecuencia + importancia", none: "Sin medición" } as Record<string,string>)[content.measurement_mode] ?? content.measurement_mode;
    const visibilityLabel = content.visibility === "student" ? "Visible para el alumno" : "Solo profesores";
    const publicationLabel = content.publication_status === "published" ? "Publicada" : content.publication_status === "archived" ? "Archivada" : "Borrador";
    const statusLabel = content.publication_status === "published" ? "Publicada" : content.completion_status === "incomplete" ? "Incompleta" : "Borrador";
    return <TeachingContentCard
      key={content.id}
      kindLabel={teachingKindLabels[content.content_type]}
      title={content.title}
      subtitle={`${linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · ${linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · ${linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}`}
      statusLabel={statusLabel}
      statusTone={content.publication_status === "published" ? "success" : content.completion_status === "incomplete" ? "warning" : "default"}
      description={content.description}
      correctionGuidance={content.correction_guidance}
      media={content.teaching_content_media}
      tags={content.teaching_content_tags.map((tag) => tag.tag)}
      metadata={[
        { label: "Tipo", value: teachingKindLabels[content.content_type] },
        { label: "Categoría", value: category },
        { label: "Estado", value: publicationLabel },
        { label: "Visibilidad", value: visibilityLabel },
        ...(content.content_type === "correction" ? [{ label: "Medición", value: measurementLabel }] : []),
        { label: "Estilos", value: linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms) },
        { label: "Roles", value: linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms) },
        { label: "Niveles", value: linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms) },
      ]}
      actions={<>
        <button className="icon-btn" onClick={() => setRelating(content)} aria-label={`Relaciones de ${content.title}`} title="Relaciones"><Link2 /></button>
        <button className="icon-btn" onClick={() => setEditing(content)} aria-label={`Editar ${content.title}`} title="Editar"><Pencil /></button>
      </>}
    >
      {ownRelations.length ? <div style={{ display:"grid", gap:7 }}><span style={{ color:"#777287", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:".04em" }}>Relaciones</span><div style={{ display:"grid", gap:6 }}>{ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"9px 10px", border:"1px solid #e8e5ee", borderRadius:10, background:"white" }}><span style={{ color:"#777287", fontSize:10 }}>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong style={{ fontSize:11, textAlign:"right" }}>{other?.title ?? "Contenido archivado"}</strong></div>; })}</div></div> : null}
    </TeachingContentCard>;
  };
  return <>'''
text, count = render_pattern.subn(render_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one TeachingView renderContent block, replaced {count}")

portal_pattern = re.compile(r'    <section className="portal-grid"><article className="card portal-card"><div className="card-head"><h2>Mi formación</h2>.*?</article>\n      <article className="card portal-card"><div className="card-head"><h2>Mi evolución</h2>', re.S)
portal_replacement = '''    <section className="portal-grid"><article className="card portal-card"><div className="card-head"><h2>Mi formación</h2><span>{snapshot.assignments.length}</span></div>{snapshot.assignments.length ? <div className="portal-learning-list">{snapshot.assignments.map((assignment) => <TeachingContentCard
        key={assignment.id}
        kindLabel={teachingKindLabels[assignment.content_type] ?? assignment.content_type}
        title={assignment.title}
        statusLabel={assignmentOptions(assignment.content_type).find(([value]) => value === assignment.assignment_status)?.[1] ?? assignment.assignment_status}
        statusTone={["corrected","explained","completed"].includes(assignment.assignment_status) ? "success" : "default"}
        description={assignment.description}
        correctionGuidance={assignment.correction_guidance}
        media={assignment.media ?? []}
        metadata={[
          ...(assignment.current_frequency !== null ? [{ label: "Frecuencia", value: String(assignment.current_frequency) }] : []),
          ...(assignment.current_importance !== null ? [{ label: "Importancia", value: String(assignment.current_importance) }] : []),
        ]}
      />)}</div> : <div className="compact-empty"><BookOpen /><span>Cuando te asignemos contenido aparecerá aquí.</span></div>}</article>
      <article className="card portal-card"><div className="card-head"><h2>Mi evolución</h2>'''
text, count = portal_pattern.subn(portal_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one student portal formation block, replaced {count}")

corrections_pattern = re.compile(r'          <div className="correction-list">\{currentCorrections.length \? currentCorrections.map\(\(assignment\) => <details className="correction-item".*?</details>\) : <div className="compact-empty"><CheckCircle2 /><span>\{personAssignments.some\(\(assignment\) => assignment.teaching_contents.content_type === "correction"\) && !showAll \? "No quedan correcciones activas\." : "Todavía no hay correcciones para este alumno\."\}</span></div>\}</div>', re.S)
corrections_replacement = '''          <div className="correction-list">{currentCorrections.length ? currentCorrections.map((assignment) => { const libraryContent = library.find((content) => content.id === assignment.content_id); return <TeachingContentCard
            key={assignment.id}
            kindLabel="Corrección"
            title={assignment.teaching_contents.title}
            subtitle={`${correctionStateLabel(assignment.assignment_status)}${assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}${assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}`}
            statusLabel={correctionStateLabel(assignment.assignment_status)}
            statusTone={assignment.assignment_status === "corrected" ? "success" : "default"}
            description={assignment.teaching_contents.description}
            correctionGuidance={assignment.teaching_contents.correction_guidance}
            media={libraryContent?.teaching_content_media ?? []}
          >
            <div className="correction-detail"><label className="field"><span>Estado</span><select value={assignment.assignment_status} disabled={busy === `correction-${assignment.id}`} onChange={(e) => updateCorrection(assignment, { status: e.target.value })}>{correctionStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{assignment.snapshot_measurement_mode === "frequency" || assignment.snapshot_measurement_mode === "both" ? <label className="field"><span>Frecuencia</span><select value={assignment.current_frequency ?? 0} onChange={(e) => updateCorrection(assignment, { frequency: Number(e.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}{assignment.snapshot_measurement_mode === "importance" || assignment.snapshot_measurement_mode === "both" ? <label className="field"><span>Importancia</span><select value={assignment.current_importance ?? 0} onChange={(e) => updateCorrection(assignment, { importance: Number(e.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}</div>
          </TeachingContentCard>; }) : <div className="compact-empty"><CheckCircle2 /><span>{personAssignments.some((assignment) => assignment.teaching_contents.content_type === "correction") && !showAll ? "No quedan correcciones activas." : "Todavía no hay correcciones para este alumno."}</span></div>}</div>'''
text, count = corrections_pattern.subn(corrections_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one live corrections block, replaced {count}")

guide_pattern = re.compile(r'          <div className="guide-active">.*?          </div>\n          \{guideCandidates.length \? <section className="guide-suggestions">', re.S)
guide_replacement = '''          <div className="guide-active">
            {personAssignments.filter((assignment) => assignment.teaching_contents.content_type !== "correction").length ? personAssignments.filter((assignment) => assignment.teaching_contents.content_type !== "correction").map((assignment) => { const libraryContent = library.find((content) => content.id === assignment.content_id); return <TeachingContentCard
              key={assignment.id}
              kindLabel={teachingKindLabels[assignment.teaching_contents.content_type]}
              title={assignment.teaching_contents.title}
              description={assignment.teaching_contents.description}
              correctionGuidance={assignment.teaching_contents.correction_guidance}
              media={libraryContent?.teaching_content_media ?? []}
              actions={<select value={assignment.assignment_status} disabled={busy === `guide-${assignment.id}`} onChange={(e) => updateGuideAssignment(assignment,e.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}
            />; }) : <div className="guide-empty">Aún no has añadido explicaciones, ejercicios o secuencias a esta clase.</div>}
          </div>
          {guideCandidates.length ? <section className="guide-suggestions">'''
text, count = guide_pattern.subn(guide_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one live guide block, replaced {count}")

student_call_old = '''      assignments={teachingAssignments}
      crmContact={crmContacts.find((contact) => contact.id === selected.id) ?? null}'''
student_call_new = '''      assignments={teachingAssignments}
      teachingContents={teachingContents}
      crmContact={crmContacts.find((contact) => contact.id === selected.id) ?? null}'''
if student_call_old not in text:
    raise SystemExit("StudentMasterDetail assignments prop anchor not found")
text = text.replace(student_call_old, student_call_new, 1)

app_path.write_text(text, encoding="utf-8")

student_path = Path("app/student-detail.tsx")
student = student_path.read_text(encoding="utf-8")

student_import_anchor = 'import { useEffect, useMemo, useState } from "react";\n'
student_card_import = 'import { TeachingContentCard } from "./teaching-content-card";\n'
if student_card_import not in student:
    if student_import_anchor not in student:
        raise SystemExit("Student detail import anchor not found")
    student = student.replace(student_import_anchor, student_import_anchor + student_card_import, 1)

assignment_type_end = '''};
type CrmContact = {'''
library_type = '''};
type LibraryContent = {
  id: number;
  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;
};
type CrmContact = {'''
if assignment_type_end not in student:
    raise SystemExit("Student detail Assignment type end not found")
student = student.replace(assignment_type_end, library_type, 1)

props_old = '''  assignments,
  crmContact,'''
props_new = '''  assignments,
  teachingContents,
  crmContact,'''
if props_old not in student:
    raise SystemExit("Student detail destructuring props anchor not found")
student = student.replace(props_old, props_new, 1)

type_props_old = '''  assignments: Assignment[];
  crmContact: CrmContact | null;'''
type_props_new = '''  assignments: Assignment[];
  teachingContents: LibraryContent[];
  crmContact: CrmContact | null;'''
if type_props_old not in student:
    raise SystemExit("Student detail prop types anchor not found")
student = student.replace(type_props_old, type_props_new, 1)

learning_pattern = re.compile(r'  function renderLearning\(\) \{.*?\n  \}\n\n  function renderEvaluation', re.S)
learning_replacement = '''  function renderLearning() {
    return <section className={styles.sectionCard}>
      <div className={styles.sectionHead}><div><span>Formación</span><h3>{ownAssignments.length} contenidos asignados</h3></div></div>
      {ownAssignments.length ? <div className={styles.learningList}>{ownAssignments.map((assignment) => { const libraryContent = teachingContents.find((content) => content.id === assignment.content_id); return <TeachingContentCard
        key={assignment.id}
        kindLabel={contentLabels[assignment.teaching_contents.content_type] ?? assignment.teaching_contents.content_type}
        title={assignment.teaching_contents.title}
        subtitle={`${assignmentLabels[assignment.assignment_status] ?? assignment.assignment_status}${assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}${assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}`}
        statusLabel={assignmentLabels[assignment.assignment_status] ?? assignment.assignment_status}
        statusTone={["corrected","explained","completed"].includes(assignment.assignment_status) ? "success" : "default"}
        description={assignment.teaching_contents.description}
        correctionGuidance={assignment.teaching_contents.correction_guidance}
        media={libraryContent?.teaching_content_media ?? []}
        metadata={[
          { label: "Estilo", value: termLabel(assignment.snapshot_style_term_id, terms) },
          { label: "Rol", value: termLabel(assignment.snapshot_role_term_id, terms) },
          { label: "Nivel", value: termLabel(assignment.snapshot_level_term_id, terms) },
        ]}
      />; })}</div> : <div className={styles.empty}><BookOpen /><span>No hay formación asignada todavía.</span></div>}
    </section>;
  }

  function renderEvaluation'''
student, count = learning_pattern.subn(learning_replacement, student, count=1)
if count != 1:
    raise SystemExit(f"Expected one student detail renderLearning function, replaced {count}")

student_path.write_text(student, encoding="utf-8")
