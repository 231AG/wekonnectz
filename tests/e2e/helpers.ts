import type { Page } from "@playwright/test";

export const SHOTS = "docs/progress/phase-00/screenshots";
export const SHOTS_P1 = "docs/progress/phase-01/screenshots";
export const SHOTS_P2 = "docs/progress/phase-02/screenshots";
export const SHOTS_P3 = "docs/progress/phase-03/screenshots";
export const SHOTS_P4 = "docs/progress/phase-04/screenshots";
export const SHOTS_P5 = "docs/progress/phase-05/screenshots";
export const SHOTS_P6 = "docs/progress/phase-06/screenshots";
export const SHOTS_P7 = "docs/progress/phase-07/screenshots";
export const SHOTS_P7B = "docs/progress/phase-07b/screenshots";
export const SHOTS_P8 = "docs/progress/phase-08/screenshots";

/**
 * Collects console errors (including CSP violations) and failed requests.
 * Next.js prefetches linked routes; links to routes from later phases return 404 on prefetch
 * (`_rsc=` requests) until those phases ship. Only that exact case is ignored: any other
 * failed request (including a 5xx or non-404 4xx on a prefetch) or console error is reported.
 * The browser's generic "Failed to load resource" console line is dropped because the
 * response listener already reports the real failure with its URL and status.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (res) => {
    const ignoredPrefetch404 = res.status() === 404 && res.url().includes("_rsc=");
    if (res.status() >= 400 && !ignoredPrefetch404) errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}
