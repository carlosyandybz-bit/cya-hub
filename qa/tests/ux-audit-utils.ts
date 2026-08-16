import type { Locator, Page } from "@playwright/test";

export type TouchTargetObservation = {
  tag: string;
  label: string;
  width: number;
  height: number;
};

export type ViewportGeometry = {
  viewport: { width: number; height: number } | null;
  documentWidth: number;
  clientWidth: number;
  horizontalOverflowPx: number;
  horizontallyClippedInteractives: Array<{ label: string; left: number; right: number; top: number; bottom: number }>;
};

export async function collectUndersizedTouchTargets(root: Locator, selector = "button,a,input,select,textarea,summary,[role='button']") {
  return root.locator(selector).evaluateAll((elements) => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = (element as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && box.width > 0 && box.height > 0;
    };
    const labelFor = (element: Element) => {
      const html = element as HTMLElement;
      return (element.getAttribute("aria-label") || element.getAttribute("title") || html.innerText || (element as HTMLInputElement).placeholder || (element as HTMLInputElement).name || "")
        .replace(/\s+/g, " ").trim().slice(0, 160);
    };
    const effectiveTarget = (element: Element) => {
      const input = element as HTMLInputElement;
      if (element.tagName === "INPUT" && ["checkbox", "radio"].includes(input.type)) {
        const label = element.closest("label");
        if (label && visible(label)) return label;
      }
      return element;
    };

    const seen = new Set<Element>();
    return elements.filter(visible).flatMap((element) => {
      const target = effectiveTarget(element);
      if (seen.has(target)) return [];
      seen.add(target);
      const box = (target as HTMLElement).getBoundingClientRect();
      if (box.width >= 44 && box.height >= 44) return [];
      return [{
        tag: target.tagName.toLowerCase(),
        label: labelFor(target) || labelFor(element),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }];
    }).slice(0, 100);
  }) as Promise<TouchTargetObservation[]>;
}

export async function collectViewportGeometry(page: Page): Promise<ViewportGeometry> {
  const viewport = page.viewportSize();
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = (element as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && box.width > 0 && box.height > 0;
    };
    const labelFor = (element: Element) => {
      const html = element as HTMLElement;
      return (element.getAttribute("aria-label") || element.getAttribute("title") || html.innerText || "")
        .replace(/\s+/g, " ").trim().slice(0, 120);
    };
    const vw = root.clientWidth;
    const horizontallyClippedInteractives = Array.from(document.querySelectorAll("button,a,input,select,textarea,summary,[role='button']"))
      .filter(visible)
      .flatMap((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        const clipped = rect.left < -1 || rect.right > vw + 1;
        if (!clipped) return [];
        return [{ label: labelFor(element), left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) }];
      })
      .slice(0, 100);
    return {
      documentWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      horizontallyClippedInteractives,
    };
  });

  return {
    viewport,
    documentWidth: metrics.documentWidth,
    clientWidth: metrics.clientWidth,
    horizontalOverflowPx: Math.max(0, metrics.documentWidth - metrics.clientWidth),
    horizontallyClippedInteractives: metrics.horizontallyClippedInteractives,
  };
}

export async function collectPairClearance(page: Page, firstSelector: string, secondSelector: string) {
  return page.evaluate(({ firstSelector, secondSelector }) => {
    const first = document.querySelector(firstSelector) as HTMLElement | null;
    const second = document.querySelector(secondSelector) as HTMLElement | null;
    if (!first || !second) return null;
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const horizontalGap = a.right <= b.left ? b.left - a.right : b.right <= a.left ? a.left - b.right : -overlapX;
    return {
      overlapX: Math.round(overlapX * 100) / 100,
      overlapY: Math.round(overlapY * 100) / 100,
      horizontalGap: Math.round(horizontalGap * 100) / 100,
    };
  }, { firstSelector, secondSelector });
}
