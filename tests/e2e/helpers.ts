import type { Page } from "@playwright/test";

export const SHOTS = "docs/progress/phase-00/screenshots";

/**
 * Collects console errors (including CSP violations) and failed requests.
 * Next.js prefetches linked routes; links to routes from later phases 404 on prefetch
 * (`_rsc=` requests) until those phases ship. Those are ignored; any other failed
 * request or console error is reported.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("_rsc=")) errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}
