"use client";

import { useEffect } from "react";

const OVERLAY_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  'dialog[open]',
  '.live-overlay',
].join(', ');

function visibleOverlayExists() {
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).some((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity || "1") > 0
      && rect.width > 0
      && rect.height > 0;
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

      body.dataset.cyaScrollLockY = String(scrollY);
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
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
      body.style.touchAction = "";
      root.style.overflow = "";
      root.style.overscrollBehavior = "";
      delete body.dataset.cyaScrollLockY;

      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };

    const sync = () => {
      if (visibleOverlayExists()) lock();
      else unlock();
    };

    let raf = 0;
    const scheduleSync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-modal", "open"],
    });

    sync();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      unlock();
    };
  }, []);

  return null;
}
