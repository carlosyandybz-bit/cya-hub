import type { Page } from "@playwright/test";

/**
 * Temporary QA isolation for CYA-AUD-013 / P0E.
 *
 * Both evaluation gates are currently global: they can cover unrelated surfaces whenever
 * any staff-visible class needs a baseline or post-class review. P0C audits touch targets,
 * not evaluation flow, so generic navigation/lifecycle tests hide only those known global
 * dialogs while P17 remains the evaluation-domain gate.
 *
 * This helper is TEST-ONLY. It must never be imported by app/runtime code and must be
 * removed when P0E scopes evaluation UI to the selected/current class and makes the
 * baseline evaluation optional and non-blocking in Dar clase.
 */
export async function isolateGlobalEvaluationGatesForUnrelatedQa(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.querySelector('style[data-cya-qa-isolation="aud-013"]')) return;
      const style = document.createElement("style");
      style.dataset.cyaQaIsolation = "aud-013";
      style.textContent = [
        '[role="dialog"][aria-label="Evaluación inicial guiada"]',
        '[role="dialog"][aria-label="Evaluación posterior a la clase"]',
      ].join(",") + "{display:none!important;pointer-events:none!important}";
      document.head.appendChild(style);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  });
}
