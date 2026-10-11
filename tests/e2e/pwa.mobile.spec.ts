import { expect, test } from "@playwright/test";

import { SHOTS_P12, trackPageErrors } from "./helpers";

test("Phase 12 PWA: installable manifest, service worker, and an offline screen that holds no member data", async ({
  page,
  context,
  request,
}) => {
  const errors = trackPageErrors(page);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "WeKonnectz", start_url: "/home", display: "standalone" });
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  // The worker installs and takes control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // Offline: a page that needs the network shows the offline screen.
  await context.setOffline(true);
  await page.goto("/pricing").catch(() => {});
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P12}/member-offline.png` });
  await context.setOffline(false);

  // Only the offline page is cached — never a member's page.
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    return urls.sort();
  });
  expect(cached).toEqual(["/icons/icon-any-192.png", "/offline"]);
  expect(errors.filter((e) => !e.includes("ERR_INTERNET_DISCONNECTED"))).toEqual([]);
});
