import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`P23 codemod: no se encontró ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`P23 codemod: ${label} no es único`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

const path = 'app/cya-app.tsx';
let source = fs.readFileSync(path, 'utf8');

source = replaceOnce(source,
  '  visibility: "staff" | "student"; category_term_id: number | null; active: boolean; published_at: string | null; updated_at: string;\n',
  '  visibility: "staff" | "student"; category_term_id: number | null; active: boolean; requires_partner: boolean; published_at: string | null; updated_at: string;\n',
  'requires_partner en TeachingContent');

source = replaceOnce(source,
  'id,title,content_type,description,correction_guidance,completion_status,publication_status,visibility,measurement_mode,category_term_id,active,published_at,updated_at,teaching_content_styles',
  'id,title,content_type,description,correction_guidance,completion_status,publication_status,visibility,measurement_mode,category_term_id,active,requires_partner,published_at,updated_at,teaching_content_styles',
  'select de teaching_contents');

source = replaceOnce(source,
  '  const [type, setType] = useState(initial?.content_type ?? defaultType), [busy, setBusy] = useState(false), [error, setError] = useState("");\n',
  '  const [type, setType] = useState(initial?.content_type ?? defaultType), [busy, setBusy] = useState(false), [error, setError] = useState("");\n  const [requiresPartner,setRequiresPartner] = useState(Boolean(initial?.requires_partner));\n',
  'estado requiere pareja');

source = replaceOnce(source,
  '    if (result.error) { setError(result.error.message); setBusy(false); return; }\n    await saved(); notify(intent === "publish" ? "Contenido publicado." : "Guardado en Incompletas."); setBusy(false); close();\n',
  '    if (result.error) { setError(result.error.message); setBusy(false); return; }\n    const savedContentId = Number((result.data as { id?: number } | null)?.id ?? initial?.id ?? 0);\n    if (type === "exercise" && savedContentId) {\n      const partnerResult = await db.rpc("set_teaching_exercise_partner_requirement", { p_content_id: savedContentId, p_requires_partner: requiresPartner });\n      if (partnerResult.error) { setError(partnerResult.error.message); setBusy(false); return; }\n    }\n    await saved(); notify(intent === "publish" ? "Contenido publicado." : "Guardado en Incompletas."); setBusy(false); close();\n',
  'guardado partner');

source = replaceOnce(source,
  '        {type === "correction" ? <><label className="field field-wide"><span>Cómo se corrige</span><textarea name="correction_guidance" rows={3} defaultValue={initial?.correction_guidance ?? ""} placeholder="Indicaciones concretas para corregir el error" /></label><label className="field"><span>Medir por</span><select name="measurement_mode" defaultValue={initial?.measurement_mode ?? "both"}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label></> : null}\n        <label className="field"><span>Al publicar</span>',
  '        {type === "correction" ? <><label className="field field-wide"><span>Cómo se corrige</span><textarea name="correction_guidance" rows={3} defaultValue={initial?.correction_guidance ?? ""} placeholder="Indicaciones concretas para corregir el error" /></label><label className="field"><span>Medir por</span><select name="measurement_mode" defaultValue={initial?.measurement_mode ?? "both"}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label></> : null}\n        {type === "exercise" ? <label className="field field-wide teaching-partner-toggle"><input type="checkbox" checked={requiresPartner} onChange={(event) => setRequiresPartner(event.target.checked)} /><span><strong>Necesita pareja</strong><small>Solo podrá activarse o completarse en una clase con al menos dos participantes.</small></span></label> : null}\n        <label className="field"><span>Al publicar</span>',
  'toggle pareja editor');

source = replaceOnce(source,
  '  const targetOptions = contents.filter((candidate) => candidate.id !== content.id && candidate.active).filter((candidate) => relationType === "counterpart" || relationType === "exercise_explanation" ? candidate.content_type === "explanation" : relationType === "exercise_correction" ? candidate.content_type === "correction" : true);\n  const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);\n',
  `  const idsEqual = (left:number[], right:number[]) => left.length===right.length && [...left].sort((a,b)=>a-b).every((value,index)=>value===[...right].sort((a,b)=>a-b)[index]);\n  const counterpartUsed = new Set(relations.filter((relation) => relation.relation_type === "counterpart").flatMap((relation) => [relation.source_content_id,relation.target_content_id]));\n  const contentStyles = content.teaching_content_styles.map((item) => item.style_term_id), contentRoles = content.teaching_content_roles.map((item) => item.role_term_id), contentLevels = content.teaching_content_levels.map((item) => item.level_term_id);\n  const targetOptions = contents.filter((candidate) => candidate.id !== content.id && candidate.active).filter((candidate) => {\n    if (relationType === "counterpart") {\n      const candidateRoles=candidate.teaching_content_roles.map((item)=>item.role_term_id);\n      return candidate.content_type === "explanation" && content.content_type === "explanation" && !counterpartUsed.has(content.id) && !counterpartUsed.has(candidate.id) && contentRoles.length===1 && candidateRoles.length===1 && contentRoles[0]!==candidateRoles[0] && idsEqual(contentStyles,candidate.teaching_content_styles.map((item)=>item.style_term_id)) && idsEqual(contentLevels,candidate.teaching_content_levels.map((item)=>item.level_term_id));\n    }\n    if (relationType === "exercise_explanation") return candidate.content_type === "explanation";\n    if (relationType === "exercise_correction") return candidate.content_type === "correction";\n    if (relationType === "sequence_item") return candidate.content_type !== "sequence";\n    return true;\n  });\n  const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);\n  const sequenceItems = content.content_type === "sequence" ? relations.filter((relation) => relation.source_content_id === content.id && relation.relation_type === "sequence_item").sort((a,b)=>(a.position??999999)-(b.position??999999)||a.id-b.id) : [];\n`,
  'filtro contextual de relaciones');

source = replaceOnce(source,
  '    const result = await db.rpc("save_teaching_relation", { p_source_content_id: content.id, p_target_content_id: effectiveTargetId, p_relation_type: relationType, p_position: null });\n',
  '    const nextPosition = relationType === "sequence_item" ? Math.max(0,...sequenceItems.map((item) => item.position ?? 0)) + 10 : null;\n    const result = await db.rpc("save_teaching_relation", { p_source_content_id: content.id, p_target_content_id: effectiveTargetId, p_relation_type: relationType, p_position: nextPosition });\n',
  'posición al añadir paso');

source = replaceOnce(source,
  '  async function remove(id: number) {\n    if (!db) return; setBusy(true); const result = await db.rpc("delete_teaching_relation", { p_relation_id: id });\n    if (result.error) setError(result.error.message); else { await saved(); notify("Relación eliminada."); }\n    setBusy(false);\n  }\n',
  `  async function remove(id: number) {\n    if (!db) return; setBusy(true); const result = await db.rpc("delete_teaching_relation", { p_relation_id: id });\n    if (result.error) setError(result.error.message); else { await saved(); notify("Relación eliminada."); }\n    setBusy(false);\n  }\n  async function moveSequenceItem(index:number,direction:-1|1) {\n    if (!db) return; const next=index+direction; if (next<0 || next>=sequenceItems.length) return;\n    const ordered=sequenceItems.map((item)=>item.target_content_id); [ordered[index],ordered[next]]=[ordered[next],ordered[index]];\n    setBusy(true); setError(""); const result=await db.rpc("reorder_teaching_sequence",{p_sequence_content_id:content.id,p_item_content_ids:ordered});\n    if (result.error) setError(result.error.message); else { await saved(); notify("Orden de la secuencia actualizado."); } setBusy(false);\n  }\n`,
  'reorder helper');

source = replaceOnce(source,
  '      {error ? <p className="error">{error}</p> : null}<div className="relation-list">',
  '      {error ? <p className="error">{error}</p> : null}{content.content_type === "sequence" && sequenceItems.length ? <div className="sequence-order"><div><strong>Orden de la secuencia</strong><span>Usa los controles para ordenar los pasos.</span></div>{sequenceItems.map((relation,index) => { const step=contents.find((item)=>item.id===relation.target_content_id); return <div className="sequence-order-row" key={`order-${relation.id}`}><span>{index+1}</span><strong>{step?.title ?? "Contenido archivado"}</strong><div><button className="icon-btn" disabled={busy||index===0} onClick={() => void moveSequenceItem(index,-1)} aria-label={`Subir ${step?.title ?? "paso"}`}>↑</button><button className="icon-btn" disabled={busy||index===sequenceItems.length-1} onClick={() => void moveSequenceItem(index,1)} aria-label={`Bajar ${step?.title ?? "paso"}`}>↓</button></div></div>; })}</div> : null}<div className="relation-list">',
  'UI orden secuencia');

source = replaceOnce(source,
  `  async function assignContent(content:TeachingContent) { if (!db || !participant || !contextReady || !item.style_term_id || !participant.role_term_id || !participant.level_term_id) return; if (content.content_type==='exercise') { await recordEvent(content.id,'exercise_active'); return; }`,
  `  async function assignContent(content:TeachingContent) { if (!db || !participant || !contextReady || !item.style_term_id || !participant.role_term_id || !participant.level_term_id) return; if (content.content_type==='exercise') { if (content.requires_partner && item.class_participants.length<2) { notify('Este ejercicio necesita pareja.'); return; } await recordEvent(content.id,'exercise_active'); return; }`,
  'guard UI partner Dar clase');

source = replaceOnce(source,
  `const type=result.content_type, content=library.find((row) => row.id===result.content_id), assignment=personAssignments.find((row) => row.content_id===result.content_id), exerciseEvent=exerciseEvents.find((row) => row.content_id===result.content_id); const statusLabel=type==='exercise' ?`,
  `const type=result.content_type, content=library.find((row) => row.id===result.content_id), assignment=personAssignments.find((row) => row.content_id===result.content_id), exerciseEvent=exerciseEvents.find((row) => row.content_id===result.content_id), partnerBlocked=type==='exercise'&&Boolean(content?.requires_partner)&&item.class_participants.length<2; const statusLabel=partnerBlocked?'Necesita pareja':type==='exercise' ?`,
  'estado pareja en buscador de clase');

source = replaceOnce(source,
  `      {ownRelations.length ? <div style={{ display:"grid", gap:7 }}>`,
  `      {content.content_type === "exercise" && content.requires_partner ? <span className="badge partner-badge">Necesita pareja</span> : null}{ownRelations.length ? <div style={{ display:"grid", gap:7 }}>`,
  'badge pareja biblioteca');

fs.writeFileSync(path, source);
console.log('P23 teaching UX codemod aplicado.');
