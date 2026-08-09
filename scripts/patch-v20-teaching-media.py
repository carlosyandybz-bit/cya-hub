from pathlib import Path
import re

root = Path('.')
app_path = root / 'app/cya-app.tsx'
app = app_path.read_text(encoding='utf-8')

# Imports and shared types.
app = app.replace(
    '  Clock3, Dumbbell, ExternalLink, Eye, EyeOff, FolderOpen, GitBranch, GraduationCap, House,\n  Image as ImageIcon, LibraryBig, Link2, LockKeyhole, LogOut, Megaphone, NotebookPen,\n  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UsersRound, Video,\n',
    '  Clock3, Dumbbell, Eye, EyeOff, GitBranch, GraduationCap, House,\n  LibraryBig, Link2, LockKeyhole, LogOut, Megaphone, NotebookPen,\n  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UsersRound,\n'
)
app = app.replace(
    'import { TeachingContentCard } from "./teaching-content-card";\n',
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\nimport { TeachingMediaEditor, type TeachingMediaDraft } from "./teaching-media-editor";\nimport { setRuntimeSupabaseClient } from "./supabase-runtime";\n'
)
old_media_type = '  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;'
if old_media_type not in app:
    raise SystemExit('TeachingContent media type not found')
app = app.replace(old_media_type, '  teaching_content_media: TeachingCardMedia[];', 1)
old_portal_media = '    media: Array<{ media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;'
if old_portal_media not in app:
    raise SystemExit('Portal media type not found')
app = app.replace(old_portal_media, '    media: TeachingCardMedia[];', 1)
app = re.sub(r'\ntype DriveMediaInput = .*?;\n\nconst DRIVE_TEACHING_FOLDER_URL = .*?;\n', '\n', app, count=1)

# Make the runtime Supabase session available to secure media/upload helpers.
needle = '''      db = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return db;'''
replacement = '''      db = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      setRuntimeSupabaseClient(db);
      return db;'''
if needle not in app:
    raise SystemExit('createClient block not found')
app = app.replace(needle, replacement, 1)

# Remove legacy paste-link media editor.
app, removed = re.subn(
    r'\nfunction driveId\(value: string\) \{.*?\nfunction contentFitsContext',
    '\nfunction contentFitsContext',
    app,
    count=1,
    flags=re.S,
)
if removed != 1:
    raise SystemExit(f'Legacy media editor removal count {removed}')

# Wire the new controlled multimedia editor into TeachingContentEditor.
editor_state = '  const [type, setType] = useState(initial?.content_type ?? defaultType), [busy, setBusy] = useState(false), [error, setError] = useState("");\n'
if editor_state not in app:
    raise SystemExit('TeachingContentEditor state not found')
app = app.replace(editor_state, editor_state + '''  const [media, setMedia] = useState<TeachingMediaDraft[]>(() => (initial?.teaching_content_media ?? []).map((item) => ({ ...item, _key: `existing-${item.id ?? item.external_file_id}` })));
  const [mediaUploading, setMediaUploading] = useState(false);
''', 1)

old_pmedia = '      p_media: teachingMediaFrom(form),'
new_pmedia = '''      p_media: media.map((item) => ({
        media_type: item.media_type,
        provider: "google_drive",
        external_file_id: item.external_file_id,
        title: item.title || null,
        mime_type: item.mime_type || null,
        group_label: item.group_label || null,
        is_cover: Boolean(item.is_cover),
        is_preview: Boolean(item.is_preview),
        display_in_resources: item.display_in_resources !== false,
        thumbnail_external_file_id: item.thumbnail_external_file_id || null,
        thumbnail_mime_type: item.thumbnail_mime_type || null,
        preview_start_seconds: item.preview_start_seconds ?? null,
        preview_end_seconds: item.preview_end_seconds ?? null,
      })),'''
if old_pmedia not in app:
    raise SystemExit('p_media legacy call not found')
app = app.replace(old_pmedia, new_pmedia, 1)

old_fields = '      <TeachingMediaFields existing={initial?.teaching_content_media ?? []} />'
new_fields = '      <TeachingMediaEditor value={media} onChange={setMedia} onUploadingChange={setMediaUploading} />'
if old_fields not in app:
    raise SystemExit('TeachingMediaFields JSX not found')
app = app.replace(old_fields, new_fields, 1)

# Prevent content save while an upload/frame capture is running.
app = app.replace('disabled={busy}>Archivar</button>', 'disabled={busy || mediaUploading}>Archivar</button>', 1)
app = app.replace('name="intent" value="draft" disabled={busy}>Guardar incompleta</button>', 'name="intent" value="draft" disabled={busy || mediaUploading}>Guardar incompleta</button>', 1)
app = app.replace('name="intent" value="publish" disabled={busy}>', 'name="intent" value="publish" disabled={busy || mediaUploading}>', 1)

# Load all v20 media metadata everywhere the teaching library is loaded.
legacy_select = 'teaching_content_media(id,media_type,provider,external_file_id,title)'
expanded_select = 'teaching_content_media(id,media_type,provider,external_file_id,title,mime_type,sort_order,group_label,is_cover,is_preview,display_in_resources,thumbnail_external_file_id,thumbnail_mime_type,preview_start_seconds,preview_end_seconds)'
if legacy_select not in app:
    raise SystemExit('Teaching media select not found')
app = app.replace(legacy_select, expanded_select)

app_path.write_text(app, encoding='utf-8')

# Student master profile shares the same media type.
student_path = root / 'app/student-detail.tsx'
student = student_path.read_text(encoding='utf-8')
student = student.replace(
    'import { TeachingContentCard } from "./teaching-content-card";',
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";'
)
student_old = '  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;'
if student_old not in student:
    raise SystemExit('Student LibraryContent media type not found')
student = student.replace(student_old, '  teaching_content_media: TeachingCardMedia[];', 1)
student_path.write_text(student, encoding='utf-8')

# Fix multi-file uploads so each successful file accumulates instead of replacing the previous one.
media_path = root / 'app/teaching-media-editor.tsx'
media = media_path.read_text(encoding='utf-8')
pattern = re.compile(r'  async function addFiles\(files: File\[], role: "cover" \| "resources"\) \{.*?\n  function update\(', re.S)
replacement = '''  async function addFiles(files: File[], role: "cover" | "resources") {
    if (!files.length) return;
    setError("");
    let busyCount = 0;
    let working = role === "cover" ? value.map((item) => ({ ...item, is_cover: false })) : [...value];
    setBusy(files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/")).length);
    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      busyCount += 1;
      const localUrl = URL.createObjectURL(file);
      try {
        const uploaded = await uploadToDrive(file, file.name, file.type);
        const hasCover = working.some((item) => item.is_cover);
        const nextItem: TeachingMediaDraft = {
          _key: `${uploaded.id}-${Date.now()}-${busyCount}`,
          _local_url: localUrl,
          media_type: file.type.startsWith("image/") ? "image" : "video",
          provider: "google_drive",
          external_file_id: uploaded.id!,
          title: fileTitle(file.name),
          mime_type: uploaded.mimeType || file.type,
          group_label: role === "cover" ? null : "Recursos",
          is_cover: role === "cover" || !hasCover,
          is_preview: false,
          display_in_resources: role !== "cover",
          thumbnail_external_file_id: null,
          thumbnail_mime_type: null,
          preview_start_seconds: null,
          preview_end_seconds: null,
        };
        working = [...working, nextItem];
        onChange(working);
      } catch (reason) {
        URL.revokeObjectURL(localUrl);
        setError(reason instanceof Error ? reason.message : "No se pudo subir un archivo.");
      }
      setBusy(Math.max(0, files.length - busyCount));
    }
    setBusy(0);
  }

  function update('''
media, count = pattern.subn(replacement, media, count=1)
if count != 1:
    raise SystemExit(f'addFiles patch count {count}')
media_path.write_text(media, encoding='utf-8')
