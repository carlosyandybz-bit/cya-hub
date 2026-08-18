"use client";

import { useEffect, useRef, useState } from "react";
import { prepareVideoForUpload, uploadPreparedToDrive, type PreparedUpload, type UploadProgress } from "./video-upload-client";

const WHOLE_PIPELINE_TIMEOUT_MS = 15 * 60 * 1000;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function weightedPercent(progress: UploadProgress) {
  const value = Math.max(0, Math.min(1, progress.progress));
  if (progress.stage === "preparing") return Math.round(value * 5);
  if (progress.stage === "compressing") return Math.round(5 + value * 45);
  if (progress.stage === "uploading") return Math.round(50 + value * 45);
  if (progress.stage === "finalizing") return Math.round(95 + value * 4);
  return 100;
}

function withTimeout<T>(promise: Promise<T>, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), WHOLE_PIPELINE_TIMEOUT_MS);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

function preparedBlob(body: Blob, name: string, mimeType: string): PreparedUpload {
  return {
    blob: body,
    name,
    mimeType,
    originalSize: body.size,
    finalSize: body.size,
    compressed: false,
    savingsPercent: 0,
    reason: "not-video",
  };
}

export function ClassMediaUploadGuard() {
  const [status, setStatus] = useState<UploadProgress | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<UploadProgress>).detail;
      if (!detail) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setStatus(detail);
      if (detail.stage === "done") {
        hideTimer.current = window.setTimeout(() => setStatus(null), 2600);
      }
    };
    window.addEventListener("cya:drive-upload-progress", onProgress);
    return () => {
      window.removeEventListener("cya:drive-upload-progress", onProgress);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const guardedFetch: typeof window.fetch = async (input, init) => {
      let url: URL;
      try {
        url = new URL(requestUrl(input), window.location.origin);
      } catch {
        return originalFetch(input, init);
      }
      if (url.pathname !== "/api/google-drive/upload") return originalFetch(input, init);

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get("x-cya-upload-bypass-guard") === "1") return originalFetch(input, init);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const body = init?.body;
      if (method !== "POST" || !(body instanceof Blob)) return originalFetch(input, init);

      const mimeType = (headers.get("content-type") || body.type || "application/octet-stream").split(";")[0].trim();
      const encodedName = headers.get("x-cya-file-name") || "video.mp4";
      let name = "video.mp4";
      try { name = decodeURIComponent(encodedName); } catch { name = encodedName; }
      const scope = headers.get("x-cya-media-scope") === "class_video" ? "class_video" : "teaching";
      const source = body instanceof File ? body : new File([body], name, { type: mimeType });

      try {
        const task = (async () => {
          const prepared = mimeType.startsWith("video/")
            ? await prepareVideoForUpload(source)
            : preparedBlob(body, name, mimeType);
          return uploadPreparedToDrive(prepared, scope);
        })();
        const payload = await withTimeout(task, "El procesamiento del vídeo ha tardado demasiado. Puedes volver a intentarlo; el cierre de clase ya no quedará bloqueado.");
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "No se pudo completar la subida del vídeo.";
        setStatus(null);
        return new Response(JSON.stringify({ error: message }), {
          status: 502,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
    };
  }, []);

  if (!status) return null;
  const percent = weightedPercent(status);
  const done = status.stage === "done";

  return <aside
    role="status"
    aria-live="polite"
    aria-label="Estado de subida a Google Drive"
    style={{
      position: "fixed",
      top: "calc(env(safe-area-inset-top, 0px) + 10px)",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 2147483000,
      width: "min(calc(100vw - 24px), 430px)",
      padding: "12px 14px",
      borderRadius: 16,
      border: "1px solid color-mix(in srgb, var(--cya-line-strong, #ffffff) 75%, transparent)",
      background: "color-mix(in srgb, var(--cya-surface, #111318) 94%, transparent)",
      boxShadow: "0 16px 44px rgba(0,0,0,.3)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      color: "var(--cya-text, #fff)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <strong style={{ fontSize: 13, lineHeight: 1.25 }}>{done ? "Vídeo guardado" : "Procesando vídeo"}</strong>
        <span style={{ fontSize: 12, opacity: .78, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status.message}</span>
      </div>
      <strong style={{ flex: "0 0 auto", fontSize: 14 }}>{done ? "✓" : `${percent}%`}</strong>
    </div>
    <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.12)" }}>
      <div style={{ height: "100%", width: `${percent}%`, borderRadius: 999, background: "currentColor", opacity: done ? .95 : .82, transition: "width 180ms ease-out" }} />
    </div>
  </aside>;
}
