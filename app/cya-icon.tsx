"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";

export type CyaFallbackIcon = ComponentType<SVGProps<SVGSVGElement>>;

type IconResponse = { icons?: Record<string, string> };

let iconMap: Record<string, string> = {};
let iconRequest: Promise<Record<string, string>> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function invalidateCyaIcons() {
  iconRequest = null;
  void loadIcons(true);
}

async function loadIcons(force = false) {
  if (force) iconRequest = null;
  if (!iconRequest) {
    iconRequest = fetch("/api/appearance/icons", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as IconResponse : { icons: {} })
      .then((body) => {
        iconMap = body.icons ?? {};
        emit();
        return iconMap;
      })
      .catch(() => iconMap);
  }
  return iconRequest;
}

export function CyaIcon({
  iconKey,
  fallback: Fallback,
  className,
  size,
  strokeWidth,
  "aria-hidden": ariaHidden = true,
  alt = "",
}: {
  iconKey: string;
  fallback: CyaFallbackIcon;
  className?: string;
  size?: number | string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
  alt?: string;
}) {
  const [, refresh] = useState(0);

  useEffect(() => {
    const listener = () => refresh((value) => value + 1);
    listeners.add(listener);
    void loadIcons();
    const onChanged = () => invalidateCyaIcons();
    window.addEventListener("cya:icons-changed", onChanged);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("cya:icons-changed", onChanged);
    };
  }, []);

  const custom = iconMap[iconKey];
  if (custom) {
    const dimension = size ?? 24;
    return <img
      src={custom}
      alt={ariaHidden ? "" : alt}
      className={className}
      width={typeof dimension === "number" ? dimension : undefined}
      height={typeof dimension === "number" ? dimension : undefined}
      aria-hidden={ariaHidden || undefined}
      draggable={false}
      decoding="async"
      data-cya-icon={iconKey}
    />;
  }

  return <Fallback className={className} width={size} height={size} strokeWidth={strokeWidth} aria-hidden={ariaHidden || undefined} data-cya-icon={iconKey} />;
}
