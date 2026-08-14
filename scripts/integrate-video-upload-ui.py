from pathlib import Path


def patch(path: str, replacements: list[tuple[str, str]]) -> None:
    p = Path(path)
    text = p.read_text()
    for old, _ in replacements:
        if old not in text:
            raise SystemExit(f"Missing anchor in {path}: {old[:120]!r}")
    for old, new in replacements:
        text = text.replace(old, new, 1)
    p.write_text(text)


patch("app/teaching-media-editor.tsx", [
    (
        'import { getRuntimeAccessToken, getRuntimeSupabaseClient } from "./supabase-runtime";\n',
        'import { getRuntimeSupabaseClient } from "./supabase-runtime";\nimport { prepareVideoForUpload, uploadPreparedToDrive, type PreparedUpload } from "./video-upload-client";\n',
    ),
    (
        '''async function uploadToDrive(file: Blob, name: string, mimeType: string) {\n  const token = await getRuntimeAccessToken();\n  if (!token) throw new Error("Tu sesión ha caducado.");\n  const response = await fetch("/api/google-drive/upload", {\n    method: "POST",\n    headers: {\n      authorization: `Bearer ${token}`,\n      "content-type": mimeType || "application/octet-stream",\n      "x-cya-file-name": encodeURIComponent(name),\n      "x-cya-file-size": String(file.size),\n    },\n    body: file,\n  });\n  const payload = await response.json().catch(() => null) as { id?: string; name?: string; mimeType?: string; error?: string } | null;\n  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el archivo a Drive.");\n  return payload;\n}\n''',
        '''async function uploadToDrive(file: Blob, name: string, mimeType: string) {\n  const prepared: PreparedUpload = { blob: file, name, mimeType: mimeType || "application/octet-stream", originalSize: file.size, finalSize: file.size, compressed: false, savingsPercent: 0, reason: "not-video" };\n  return uploadPreparedToDrive(prepared);\n}\n''',
    ),
    (
        '  const [uploading, setUploading] = useState(0), [error, setError] = useState(""), [manualOpen, setManualOpen] = useState(false), [frameIndex, setFrameIndex] = useState<number | null>(null);',
        '  const [uploading, setUploading] = useState(0), [uploadMessage, setUploadMessage] = useState(""), [error, setError] = useState(""), [manualOpen, setManualOpen] = useState(false), [frameIndex, setFrameIndex] = useState<number | null>(null);',
    ),
    (
        '        const uploaded = await uploadToDrive(file, file.name, file.type);',
        '''        const prepared = file.type.startsWith("video/")\n          ? await prepareVideoForUpload(file, (progress) => setUploadMessage(progress.message))\n          : { blob: file, name: file.name, mimeType: file.type, originalSize: file.size, finalSize: file.size, compressed: false, savingsPercent: 0, reason: "not-video" as const };\n        const uploaded = await uploadPreparedToDrive(prepared, "teaching", (progress) => setUploadMessage(progress.message));\n        if (prepared.compressed) setUploadMessage(`Vídeo optimizado · ${prepared.savingsPercent}% menos`);''',
    ),
    (
        '{uploading ? <div className={styles.uploading}><span /><strong>Subiendo {uploading === 1 ? "archivo" : `${uploading} archivos`} a Drive…</strong></div> : null}',
        '{uploading ? <div className={styles.uploading}><span /><strong>{uploadMessage || `Subiendo ${uploading === 1 ? "archivo" : `${uploading} archivos`} a Drive…`}</strong></div> : uploadMessage ? <div className={styles.uploading}><strong>{uploadMessage}</strong></div> : null}',
    ),
])

patch("app/feedback-online-student.tsx", [
    (
        'import { SecureDriveAsset } from "./drive-media";\n',
        'import { SecureDriveAsset } from "./drive-media";\nimport { prepareVideoForUpload, uploadPreparedFeedback } from "./video-upload-client";\n',
    ),
    (
        '  const [busy, setBusy] = useState("");\n  const [error, setError] = useState("");',
        '  const [busy, setBusy] = useState("");\n  const [uploadMessage, setUploadMessage] = useState("");\n  const [error, setError] = useState("");',
    ),
    (
        '''  async function uploadVideo(requestId: number, file: File) {\n    if (!file.type.startsWith("video/")) return setError("Selecciona un archivo de vídeo.");\n    if (file.size <= 0 || file.size > 1024 * 1024 * 1024) return setError("El vídeo debe ser menor de 1 GB.");\n    setBusy(`upload-${requestId}`); setError("");\n    const session = await client.auth.getSession();\n    const token = session.data.session?.access_token;\n    if (!token) { setError("Tu sesión ha caducado. Vuelve a entrar."); setBusy(""); return; }\n    const response = await fetch("/api/feedback-online/upload", {\n      method: "POST",\n      headers: {\n        authorization: `Bearer ${token}`,\n        "content-type": file.type || "video/mp4",\n        "x-cya-file-name": encodeURIComponent(file.name),\n        "x-cya-file-size": String(file.size),\n        "x-cya-feedback-request-id": String(requestId),\n      },\n      body: file,\n    });\n    const payload = await response.json().catch(() => null) as { error?: string } | null;\n    if (!response.ok) setError(payload?.error || "No se pudo subir el vídeo.");\n    else { notify?.("Vídeo guardado. Revísalo y envíalo cuando quieras."); await load(); }\n    setBusy("");\n  }\n''',
        '''  async function uploadVideo(requestId: number, file: File) {\n    if (!file.type.startsWith("video/")) return setError("Selecciona un archivo de vídeo.");\n    if (file.size <= 0 || file.size > 1024 * 1024 * 1024) return setError("El vídeo debe ser menor de 1 GB.");\n    setBusy(`upload-${requestId}`); setError(""); setUploadMessage("Preparando vídeo…");\n    try {\n      const prepared = await prepareVideoForUpload(file, (progress) => setUploadMessage(progress.message));\n      await uploadPreparedFeedback(requestId, prepared, (progress) => setUploadMessage(progress.message));\n      setUploadMessage(prepared.compressed ? `Vídeo optimizado · ${prepared.savingsPercent}% menos` : "Vídeo guardado");\n      notify?.(prepared.compressed ? `Vídeo guardado · ${prepared.savingsPercent}% menos de tamaño.` : "Vídeo guardado. Revísalo y envíalo cuando quieras.");\n      await load();\n    } catch (reason) {\n      setError(reason instanceof Error ? reason.message : "No se pudo subir el vídeo.");\n      setUploadMessage("");\n    }\n    setBusy("");\n  }\n''',
    ),
    (
        '<label className="btn ghost"><Upload /> {busy === `upload-${openRequest.id}` ? "Subiendo…" : openRequest.external_file_id ? "Cambiar vídeo" : "Subir vídeo"}',
        '<label className="btn ghost"><Upload /> {busy === `upload-${openRequest.id}` ? (uploadMessage || "Subiendo…") : openRequest.external_file_id ? "Cambiar vídeo" : "Subir vídeo"}',
    ),
])
