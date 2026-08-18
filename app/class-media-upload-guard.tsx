"use client";

import { useEffect } from "react";

const CLASS_MEDIA_CLIENT_TIMEOUT_MS = 195_000;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function ClassMediaUploadGuard() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const guardedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (!url.includes("/api/google-drive/upload")) return originalFetch(input, init);

      const controller = new AbortController();
      const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      let timedOut = false;

      const forwardAbort = () => controller.abort(sourceSignal?.reason);
      if (sourceSignal) {
        if (sourceSignal.aborted) forwardAbort();
        else sourceSignal.addEventListener("abort", forwardAbort, { once: true });
      }

      const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, CLASS_MEDIA_CLIENT_TIMEOUT_MS);

      try {
        return await originalFetch(input, { ...init, signal: controller.signal });
      } catch (cause) {
        if (!timedOut) throw cause;
        return new Response(JSON.stringify({
          error: "La subida del vídeo ha tardado demasiado. Puedes volver a intentarlo; el cierre de la clase ya no quedará bloqueado.",
        }), {
          status: 504,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      } finally {
        window.clearTimeout(timer);
        sourceSignal?.removeEventListener("abort", forwardAbort);
      }
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
