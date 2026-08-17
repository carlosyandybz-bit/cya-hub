"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MAX_PULL = 118;
const TRIGGER_PULL = 76;
const RESISTANCE = 0.5;
const SUCCESS_MS = 900;

type RefreshPhase = "idle" | "pulling" | "armed" | "refreshing" | "success";

type BeforeRefreshDetail = {
  reason: "pull-to-refresh";
  waitUntil: (promise: Promise<unknown>) => void;
};

export type CyaRefreshDetail = {
  reason: "pull-to-refresh";
  startedAt: number;
  waitUntil: (promise: Promise<unknown>) => void;
};

function isEditable(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function hasScrolledContainer(target: EventTarget | null) {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      if (canScroll && node.scrollTop > 0) return true;
    }
    node = node.parentElement;
  }
  return window.scrollY > 0 || document.documentElement.scrollTop > 0 || document.body.scrollTop > 0;
}

async function settlePendingAutosaves() {
  const pending: Promise<unknown>[] = [];
  const detail: BeforeRefreshDetail = {
    reason: "pull-to-refresh",
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };

  window.dispatchEvent(
    new CustomEvent<BeforeRefreshDetail>("cya:before-refresh", { detail }),
  );

  const active = document.activeElement;
  if (isEditable(active) && active instanceof HTMLElement) active.blur();

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (pending.length) await Promise.allSettled(pending);
}

export function PullToRefresh() {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const tracking = useRef(false);
  const refreshing = useRef(false);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState<RefreshPhase>("idle");

  const setPullDistance = useCallback((next: number) => {
    distanceRef.current = next;
    setDistance(next);
  }, []);

  const reset = useCallback(() => {
    startY.current = null;
    activePointerId.current = null;
    tracking.current = false;
    setPullDistance(0);
    setPhase((current) => (current === "refreshing" || current === "success" ? current : "idle"));
  }, [setPullDistance]);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setPhase("refreshing");
    setPullDistance(TRIGGER_PULL);

    try {
      await settlePendingAutosaves();

      const pendingRefreshes: Promise<unknown>[] = [];
      const detail: CyaRefreshDetail = {
        reason: "pull-to-refresh",
        startedAt: Date.now(),
        waitUntil(promise) {
          pendingRefreshes.push(Promise.resolve(promise));
        },
      };
      window.dispatchEvent(new CustomEvent<CyaRefreshDetail>("cya:refresh", { detail }));
      router.refresh();

      await Promise.allSettled(pendingRefreshes);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      setPhase("success");
      setPullDistance(54);
      await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_MS));
    } finally {
      refreshing.current = false;
      setPullDistance(0);
      setPhase("idle");
    }
  }, [router, setPullDistance]);

  useEffect(() => {
    const isTouchLikePointer = (event: PointerEvent) => event.pointerType === "touch" || event.pointerType === "pen";

    const onPointerDown = (event: PointerEvent) => {
      if (!isTouchLikePointer(event)) return;
      if (refreshing.current || !event.isPrimary || hasScrolledContainer(event.target)) {
        reset();
        return;
      }
      startY.current = event.clientY;
      activePointerId.current = event.pointerId;
      tracking.current = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isTouchLikePointer(event) || !tracking.current || startY.current === null) return;
      if (activePointerId.current !== event.pointerId || !event.isPrimary) return;
      if (hasScrolledContainer(event.target)) {
        reset();
        return;
      }

      const raw = event.clientY - startY.current;
      if (raw <= 0) {
        reset();
        return;
      }

      const nextDistance = Math.min(MAX_PULL, raw * RESISTANCE);
      if (nextDistance > 2 && event.cancelable) event.preventDefault();
      setPullDistance(nextDistance);
      setPhase(nextDistance >= TRIGGER_PULL ? "armed" : "pulling");
    };

    const finishPointer = (event: PointerEvent) => {
      if (!isTouchLikePointer(event) || !tracking.current) return;
      if (activePointerId.current !== event.pointerId) return;
      const shouldRefresh = distanceRef.current >= TRIGGER_PULL;
      startY.current = null;
      activePointerId.current = null;
      tracking.current = false;
      if (shouldRefresh) void refresh();
      else reset();
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", finishPointer, { passive: true });
    document.addEventListener("pointercancel", finishPointer, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finishPointer);
      document.removeEventListener("pointercancel", finishPointer);
    };
  }, [refresh, reset, setPullDistance]);

  const progress = Math.min(1, distance / TRIGGER_PULL);
  const visible = phase !== "idle" || distance > 1;

  return (
    <div
      className="cya-pull-refresh"
      data-testid="cya-pull-refresh"
      data-phase={phase}
      data-visible={visible ? "true" : "false"}
      aria-live="polite"
      aria-atomic="true"
      style={{
        "--cya-pull-distance": `${distance}px`,
        "--cya-pull-progress": progress,
      } as CSSProperties}
    >
      <div className="cya-pull-refresh__surface">
        <span className="cya-pull-refresh__mark" aria-hidden="true">
          <img src="/cya-logo.png" alt="" />
        </span>
        <span className="cya-pull-refresh__label">
          {phase === "refreshing"
            ? "Actualizando"
            : phase === "success"
              ? "Actualizado"
              : phase === "armed"
                ? "Suelta para actualizar"
                : "Desliza para actualizar"}
        </span>
      </div>
    </div>
  );
}
