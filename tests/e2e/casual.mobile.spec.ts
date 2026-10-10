import { expect, test } from "@playwright/test";

import { loginViaUi } from "./auth-helpers";
import { SHOTS_P9, trackPageErrors } from "./helpers";
import { activeMember, givePassViaCard, goAvailable, refundCardPass } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§13–14: Available Now, a Casual profile, a request accepted into a chat, Saved; read-only without a pass (BR-16, 21, 22, 25, 31)", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  const musu = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], { gender: "WOMAN" });
  const joseph = await activeMember("Joseph", [IMG("joseph.jpg"), IMG("emmanuel.jpg"), IMG("varney.jpg")], {
    gender: "MAN",
    area: "Sinkor",
  });
  const prince = await activeMember("Prince", [IMG("prince.jpg"), IMG("kemah.jpg"), IMG("varney.jpg")], {
    gender: "MAN",
  });

  // BR-16: no pass → no pool.
  await loginViaUi(page, musu.phone);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/casual");
  await expect(page.getByTestId("pass-status")).toHaveText("Casual needs a pass");
  await expect(page.getByTestId("pool-card")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS_P9}/member-casual-available-now-no-pass.png`, fullPage: true });

  const musuPass = await givePassViaCard(request, musu.userId);
  await givePassViaCard(request, joseph.userId);
  await givePassViaCard(request, prince.userId);
  await goAvailable(joseph.userId, 5);
  await goAvailable(prince.userId, 3);

  await page.goto("/casual");
  await expect(page.getByRole("heading", { name: "Available now" })).toBeVisible();
  await expect(page.getByTestId("pass-status")).toContainText("Pass active");
  await expect(page.getByTestId("pool-card").filter({ hasText: "Joseph" })).toBeVisible();
  await expect(page.getByTestId("pool-card").filter({ hasText: "Prince" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P9}/member-casual-available-now.png`, fullPage: true });

  await page.goto("/casual?minAge=80");
  await expect(page.getByTestId("pool-empty")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P9}/member-casual-available-now-empty.png`, fullPage: true });

  // Casual profile, Save, Send a request.
  await page.goto("/casual");
  await page.getByTestId("pool-card").filter({ hasText: "Joseph" }).click();
  await expect(page).toHaveURL(new RegExp(`/casual/m/${joseph.userId}$`));
  await expect(page.getByText(/Available until/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P9}/member-casual-profile.png`, fullPage: true });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved — remove" })).toBeVisible();

  await page.getByRole("button", { name: "Send a request" }).click();
  await page.getByLabel("Your message").fill("Hi Joseph, call me on 0770 123 456");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Contact details and prices aren’t allowed.")).toBeVisible();
  await page.getByLabel("Your message").fill("Hey Joseph, saw we both love live music. Fancy a chat?");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent.")).toBeVisible();

  await page.goto("/casual/saved");
  await expect(page.getByTestId("pool-card").filter({ hasText: "Joseph" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P9}/member-saved.png`, fullPage: true });

  // Joseph answers in Messages → Requests (BR-22).
  const josephPage = await browser.newPage({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });
  await loginViaUi(josephPage, joseph.phone);
  await expect(josephPage).toHaveURL(/\/home$/);
  await josephPage.goto("/messages/requests");
  await expect(josephPage.getByRole("link", { name: "Requests · 1" })).toBeVisible();
  const req = josephPage.getByTestId("request");
  await expect(req).toContainText("Musu");
  await expect(req).toContainText("Fancy a chat?");
  await josephPage.screenshot({ path: `${SHOTS_P9}/member-message-requests.png`, fullPage: true });
  await req.getByRole("button", { name: "Accept" }).click();
  await expect(josephPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(josephPage.getByText("Hey Joseph, saw we both love live music. Fancy a chat?")).toBeVisible();
  const conversationUrl = josephPage.url();
  await josephPage.close();

  // BR-25: Musu's pass ends → the Casual chat is read-only, history kept.
  await refundCardPass(request, musuPass);
  await page.goto(conversationUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByText("Hey Joseph, saw we both love live music. Fancy a chat?")).toBeVisible();
  await expect(page.getByText(/this Casual chat is read-only/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS_P9}/member-casual-chat-read-only.png`, fullPage: true });
  expect(errors).toEqual([]);
});
