from pathlib import Path
import re

path = Path('app/cya-app.tsx')
text = path.read_text()

import_anchor = 'import { setRuntimeSupabaseClient } from "./supabase-runtime";\n'
import_line = 'import { ClassSummaryContentEditor } from "./class-summary-content-editor";\n'
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit('supabase runtime import anchor not found')
    text = text.replace(import_anchor, import_anchor + import_line, 1)

start = text.index('function ClassFinalSummary(')
end = text.index('\nfunction LiveSession(', start)
section = text[start:end]

state_pattern = re.compile(
    r'  const \[events,setEvents\] = useState<ClassContentEvent\[\]>\(\[\]\), \[studentMessage,setStudentMessage\] = useState\(""\), \[internalNote,setInternalNote\] = useState\(""\), \[media,setMedia\] = useState<MediaDraft\[\]>\(\[\]\), \[busy,setBusy\] = useState\(false\), \[error,setError\] = useState\(""\);\n'
    r'  useEffect\(\(\) => \{ if \(!db\) return; let alive=true; void db\.from\("class_content_events"\)\.select\("id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents\(title,content_type\)"\)\.eq\("class_id",item\.id\)\.order\("created_at"\)\.then\(\(result\) => \{ if \(alive && !result\.error\) setEvents\(\(result\.data \?\? \[\]\) as unknown as ClassContentEvent\[\]\); \}\); return \(\) => \{ alive=false; \}; \}, \[item\.id\]\);'
)
replacement = '''  const [events,setEvents] = useState<ClassContentEvent[]>([]), [studentMessage,setStudentMessage] = useState(""), [internalNote,setInternalNote] = useState(""), [media,setMedia] = useState<MediaDraft[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const loadSummaryEvents=useCallback(async () => { if (!db) return; const result=await db.from("class_content_events").select("id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents(title,content_type)").eq("class_id",item.id).order("created_at"); if (result.error) { setError(result.error.message); return; } setEvents((result.data ?? []) as unknown as ClassContentEvent[]); },[item.id]);
  useEffect(() => { const timer=window.setTimeout(() => void loadSummaryEvents(),0); return () => window.clearTimeout(timer); }, [loadSummaryEvents]);'''
section, count = state_pattern.subn(replacement, section, count=1)
if count != 1 and 'const loadSummaryEvents=useCallback' not in section:
    raise SystemExit(f'class summary event loader replacement failed: {count}')

worked_anchor = '    <section className="card pad workflow-card"><div className="card-head"><h2>Trabajado hoy</h2>'
editor = '''    <ClassSummaryContentEditor classId={item.id} styleTermId={item.style_term_id} participants={item.class_participants} students={students} notify={notify} onChanged={loadSummaryEvents} />\n'''
if editor not in section:
    if worked_anchor not in section:
        raise SystemExit('worked-today anchor not found')
    section = section.replace(worked_anchor, editor + worked_anchor, 1)

text = text[:start] + section + text[end:]
path.write_text(text)
