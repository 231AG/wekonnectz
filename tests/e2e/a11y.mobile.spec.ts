import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { adminClient, loginViaUi } from "./auth-helpers";
import { activeMember } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

const PUBLIC_PAGES = [
  "/",
  "/about",
  "/pricing",
  "/rules",
  "/safety",
  "/terms",
  "/privacy",
  "/login",
  "/signup",
  "/region-blocked",
  "/offline",
];

test("WCAG 2.1 AA: public pages have no axe violations", async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of PUBLIC_PAGES) {
    await test.step(path, async () => {
      await page.goto(path);
      await expectAccessible(page, path);
    });
  }
});

const MEMBER_PAGES = [
  "/home",
  "/relationship",
  "/relationship/likes",
  "/relationship/matches",
  "/casual",
  "/casual/get-access",
  "/messages",
  "/messages/requests",
  "/notifications",
  "/me",
  "/me/payments",
  "/account/settings",
  "/account/notifications",
  "/account/privacy",
  "/account/verification",
  "/account/blocked",
  "/account/delete",
];

test("WCAG 2.1 AA: member pages have no axe violations", async ({ page }) => {
  test.setTimeout(150_000);
  const musu = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
    relationship: true,
  });
  const joseph = await activeMember("Joseph", [IMG("joseph.jpg"), IMG("emmanuel.jpg"), IMG("varney.jpg")], {
    gender: "MAN",
    relationship: true,
  });
  await loginViaUi(page, musu.phone);
  await expect(page).toHaveURL(/\/home$/);
  // A match gives Musu a chat to open as well.
  const admin = adminClient();
  expect((await admin.rpc("like_user", { p_viewer: joseph.userId, p_target: musu.userId })).error).toBeNull();
  const { data: liked } = await admin.rpc("like_user", { p_viewer: musu.userId, p_target: joseph.userId });
  const chat = (liked as { conversation_id: string }).conversation_id;
  for (const path of [...MEMBER_PAGES, `/m/${joseph.userId}`, `/messages/${chat}`]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expectAccessible(page, path);
    });
  }
});
