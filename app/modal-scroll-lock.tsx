"use client";

import { useEffect } from "react";

const OVERLAY_SELECTOR = ".backdrop, .live-overlay";

function visibleOverlayExists() {
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).some((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
}

export function ModalScrollLock() {
  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    let locked = false;
    let scrollY = 0;

    const lock = () => {
      if (locked) return;
      locked = true;
      scrollY = window.scrollY;

      root.classList.add("cya-overlay-open");
      body.classList.add("cya-overlay-open");
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    };

    const unlock = () => {
      if (!locked) return;
      locked = false;

      root.classList.remove("cya-overlay-open");
      body.classList.remove("cya-overlay-open");
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";

      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };

    const sync = () => {
      if (visibleOverlayExists()) lock();
      else unlock();
    };

    const observer = new MutationObserver(sync);
    observer.observe(body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    sync();

    return () => {
      observer.disconnect();
      unlock();
    };
  }, []);

  return null;
}
