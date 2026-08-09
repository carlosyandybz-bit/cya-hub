"use client";

import { Image as ImageIcon, Play, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRuntimeAccessToken } from "./supabase-runtime";

let activePreview: HTMLVideoElement | null = null;

export function useDriveMediaUrl(fileId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!fileId) {
      setUrl(null);
      setError(null);
      return;
    }
    setUrl(null);
    setError(null);
    void (async () => {
      const accessToken = await getRuntimeAccessToken();
      if (!accessToken) throw new Error("Sesión no disponible.");
      const response = await fetch("/api/google-drive/media-ticket", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ fileId }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { ticket?: string; error?: string } | null;
      if (!response.ok || !payload?.ticket) throw new Error(payload?.error || "No se pudo preparar el archivo.");
      if (alive) setUrl(`/api/google-drive/media?fileId=${encodeURIComponent(fileId)}&ticket=${encodeURIComponent(payload.ticket)}`);
    })().catch((reason) => {
      if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar el archivo.");
    });
    return () => { alive = false; };
  }, [fileId]);

  return { url, error };
}

export function SecureDriveAsset({
  fileId,
  mediaType,
  title,
  thumbnailFileId,
  controls = false,
  autoPreview = false,
  className = "",
}: {
  fileId: string;
  mediaType: "video" | "image";
  title?: string | null;
  thumbnailFileId?: string | null;
  controls?: boolean;
  autoPreview?: boolean;
  className?: string;
}) {
  const { url, error } = useDriveMediaUrl(fileId);
  const poster = useDriveMediaUrl(mediaType === "video" ? thumbnailFileId : null).url;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoPreview || controls) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting && (entries[0]?.intersectionRatio ?? 0) >= 0.65;
      if (visible) {
        if (activePreview && activePreview !== video) activePreview.pause();
        activePreview = video;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
        if (activePreview === video) activePreview = null;
      }
    }, { threshold: [0, 0.65, 1] });
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
      if (activePreview === video) activePreview = null;
    };
  }, [autoPreview, controls, url]);

  if (!url) return <div className={`drive-asset-fallback ${className}`.trim()} aria-label={title || "Multimedia"}>
    {mediaType === "video" ? <Video /> : <ImageIcon />}
    <span>{error ? "Multimedia pendiente" : "Preparando…"}</span>
  </div>;

  if (mediaType === "image") return <img className={className} src={url} alt={title || "Recurso visual"} loading="lazy" />;

  return <div className={`drive-video-shell ${className}`.trim()}>
    <video ref={videoRef} src={url} poster={poster || undefined} controls={controls} muted={!controls || autoPreview} loop={autoPreview} playsInline preload={autoPreview ? "metadata" : "none"} />
    {!controls && !autoPreview ? <span className="drive-video-play"><Play /></span> : null}
  </div>;
}
