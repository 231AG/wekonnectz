import { expect, test, type Page } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P6, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";

const LR = { "x-vercel-ip-country": "LR" };
test.use({ extraHTTPHeaders: LR });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const WOMAN = [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")];
const MAN = [IMG("kemah.jpg"), IMG("joseph.jpg"), IMG("varney.jpg")];

/** Passes on everyone else until the given member's card is shown (other test runs share the database). */
async function discoverUntil(page: Page, userId: string, areaId: string) {
  await page.goto(`/relationship?area=${areaId}`);
  for (let i = 0; i < 30; i++) {
    const link = page.getByRole("article").locator("a").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    if (href === `/m/${userId}`) return;
    await page.getByRole("button", { name: /^Pass on / }).click();
    await expect
      .poll(async () => (await page.getByRole("article").count()) && (await link.getAttribute("href")))
      .not.toBe(href);
  }
  throw new Error("member never appeared in Discover");
}

test("§15 / BR-23: like → like back → match → live chat in two browsers; money terms flagged, links refused", async ({
  page,
  browser,
}, testInfo) => {
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const { data: area } = await admin.from("areas").select("id").eq("name", "Mamba Point").single();
  const musu = await activeMember("Musu", WOMAN, { gender: "WOMAN", relationship: true, area: "Mamba Point" });
  const kemah = await activeMember("Kemah", MAN, { gender: "MAN", relationship: true, area: "Mamba Point" });

  // Musu finds Kemah in Discover and likes him.
  await loginViaUi(page, musu.phone);
  await expect(page).toHaveURL(/\/home$/);
  await discoverUntil(page, kemah.userId, area!.id);
  await expect(page.getByRole("heading", { name: /Kemah, \d+/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Verified" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P6}/member-relationship-discover.png`, fullPage: true });
  await page.getByRole("button", { name: "Like Kemah" }).click();
  await expect(page.getByRole("article").locator(`a[href="/m/${kemah.userId}"]`)).toHaveCount(0);

  // Kemah sees the like and likes back: a match opens the conversation.
  const kemahCtx = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: LR });
  const kemahPage = await kemahCtx.newPage();
  await loginViaUi(kemahPage, kemah.phone);
  await expect(kemahPage).toHaveURL(/\/home$/);
  await expect(kemahPage.getByTestId("relationship-summary")).toContainText("1 new like");
  await kemahPage.screenshot({ path: `${SHOTS_P6}/member-home.png`, fullPage: true });
  await kemahPage.goto("/relationship/likes");
  await expect(kemahPage.getByText(/Musu, \d+/)).toBeVisible();
  await kemahPage.screenshot({ path: `${SHOTS_P6}/member-likes.png`, fullPage: true });
  await kemahPage.getByRole("button", { name: "Like Musu back" }).click();
  await expect(kemahPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  const conversationId = kemahPage.url().split("/").pop()!;
  const { count: matches } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("user_a_id", [musu.userId, kemah.userId].sort()[0])
    .eq("user_b_id", [musu.userId, kemah.userId].sort()[1]);
  expect(matches).toBe(1);

  // Musu opens the match from Matches.
  await page.goto("/relationship/matches");
  await expect(page.getByText(/Kemah, \d+/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P6}/member-matches.png`, fullPage: true });
  await page.getByRole("link", { name: /Kemah, \d+/ }).click();
  await expect(page).toHaveURL(new RegExp(`/messages/${conversationId}$`));
  await expect(page.getByText("never send money to someone you haven’t met")).toBeVisible();
  await expect(page.getByRole("list", { name: "Messages" })).toHaveAttribute("data-live", "true");
  await expect(kemahPage.getByRole("list", { name: "Messages" })).toHaveAttribute("data-live", "true");

  // Live both ways, without reloading.
  await kemahPage
    .getByRole("textbox", { name: "Message" })
    .fill("Hey Musu, saw we both love live music. Fancy a chat?");
  await kemahPage.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hey Musu, saw we both love live music. Fancy a chat?")).toBeVisible();
  // Musu read it: Kemah sees "Seen" (read receipts over the channel).
  await expect(kemahPage.getByText("· Seen")).toBeVisible();
  await page.getByRole("textbox", { name: "Message" }).fill("Hi Kemah! Sure — who have you been listening to lately?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(kemahPage.getByText("Hi Kemah! Sure — who have you been listening to lately?")).toBeVisible();
  await kemahPage.getByRole("textbox", { name: "Message" }).fill("Mostly old-school highlife. You?");
  await kemahPage.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Mostly old-school highlife. You?")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P6}/member-conversation.png`, fullPage: true });

  // §14: no links in chat. OD-31: money terms are delivered and flagged (not blocked).
  await page.getByRole("textbox", { name: "Message" }).fill("Look at example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Links" })).toHaveText("Links can’t be sent in chat.");
  await page.getByRole("textbox", { name: "Message" }).fill("Send me 20 USD for transport first");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(kemahPage.getByText("Send me 20 USD for transport first")).toBeVisible();
  const { data: flags } = await admin
    .from("moderation_flags")
    .select("reason, details")
    .eq("entity_type", "MESSAGE")
    .eq("details->>sender_id", musu.userId);
  expect(flags?.map((f) => f.reason)).toEqual(["MONEY_TERMS"]);
  expect(JSON.stringify(flags)).not.toContain("transport");

  // Chats list.
  await page.goto("/messages");
  await expect(page.getByRole("link", { name: /Kemah/ })).toContainText("You: Send me 20 USD");
  await page.screenshot({ path: `${SHOTS_P6}/member-messages-chats.png`, fullPage: true });

  // Report from the chat (two taps): the recent messages go with it.
  await kemahPage.getByRole("button", { name: "Report Musu" }).click();
  await kemahPage.getByLabel("Asking for money or a scam").check();
  await kemahPage.getByRole("button", { name: "Send report" }).click();
  await expect(kemahPage.getByRole("dialog", { name: "Thanks for telling us" })).toBeVisible();
  const { data: report } = await admin
    .from("reports")
    .select("id, conversation_id")
    .eq("reported_user_id", musu.userId)
    .single();
  expect(report?.conversation_id).toBe(conversationId);
  const { count: captured } = await admin
    .from("report_messages")
    .select("id", { count: "exact", head: true })
    .eq("report_id", report!.id);
  expect(captured).toBe(4);

  // Then block: the conversation closes for both (BR-24).
  await kemahPage.getByRole("button", { name: "Also block Musu" }).click();
  await kemahPage.getByRole("button", { name: "Block", exact: true }).click();
  await expect(kemahPage).toHaveURL(/\/home\?blocked=1$/);
  expect((await page.goto(`/messages/${conversationId}`))?.status()).toBe(404);

  await kemahCtx.close();
  expect(errors.filter((e) => !e.includes(`/messages/${conversationId}`))).toEqual([]);
});

test("§15: two simultaneous mutual likes make exactly one match", async () => {
  const admin = adminClient();
  const a = await activeMember("Hawa", WOMAN, { gender: "WOMAN", relationship: true });
  const b = await activeMember("Joseph", MAN, { gender: "MAN", relationship: true });
  const results = await Promise.all([
    admin.rpc("like_user", { p_viewer: a.userId, p_target: b.userId }),
    admin.rpc("like_user", { p_viewer: b.userId, p_target: a.userId }),
  ]);
  for (const r of results) expect(r.error).toBeNull();
  expect(results.filter((r) => (r.data as { matched: boolean }).matched)).toHaveLength(1);
  const [lo, hi] = [a.userId, b.userId].sort();
  const { data: rows } = await admin.from("matches").select("id").eq("user_a_id", lo).eq("user_b_id", hi);
  expect(rows).toHaveLength(1);
  const { count } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("match_id", rows![0].id);
  expect(count).toBe(1);
});
