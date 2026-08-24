"use client";

import { useEffect } from "react";

export function LiveSearchCreateEnhancer() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".live-unified-search").forEach((section) => {
        const summary = section.querySelector<HTMLElement>(".quick-content-create > summary");
        const liveRoot = section.closest(".live-overlay");
        const input = liveRoot?.querySelector<HTMLInputElement>(".live-search input");
        if (!summary) return;
        const query = input?.value.trim() ?? "";
        summary.dataset.createLabel = query ? `Crear nuevo: “${query}”` : "Crear nuevo";
        summary.setAttribute("aria-label", query ? `Crear nuevo contenido: ${query}` : "Crear nuevo contenido");
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const onInput = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(".live-search input")) schedule();
    };

    document.addEventListener("input", onInput, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
      document.removeEventListener("input", onInput, true);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
