import { expect, test } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P11, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§20 notifications: a match and messages show under the bell, open the chat, and follow the member's settings", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const musu = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
    relationship: true,
  });
  const joseph = await activeMember("Joseph", [IMG("joseph.jpg"), IMG("emmanuel.jpg"), IMG("varney.jpg")], {
    gender: "MAN",
    relationship: true,
  });

  // Joseph and Musu like each other (a match), then Joseph writes twice.
  expect((await admin.rpc("like_user", { p_viewer: musu.userId, p_target: joseph.userId })).error).toBeNull();
  const { data: liked } = await admin.rpc("like_user", { p_viewer: joseph.userId, p_target: musu.userId });
  const conversationId = (liked as { conversation_id: string }).conversation_id;
  for (const body of ["Hi Musu, how is your week going?", "Fancy a coffee in Sinkor?"]) {
    expect(
      (await admin.rpc("send_message", { p_viewer: joseph.userId, p_conversation: conversationId, p_body: body }))
        .error,
    ).toBeNull();
  }

  await loginViaUi(page, musu.phone);
  await expect(page).toHaveURL(/\/home$/);
  // "Your profile is live" (from going live), the match and the messages.
  await expect(page.getByRole("link", { name: "Notifications, 3 unread" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P11}/member-home-bell.png` });

  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  const list = page.getByRole("list", { name: "Notifications" });
  await expect(list.getByTestId("notification").filter({ hasText: "It’s a match" })).toBeVisible();
  await expect(list.getByTestId("notification").filter({ hasText: "2 new messages" })).toBeVisible();
  // §6 rule 7: no names, no message text.
  await expect(list).not.toContainText("Joseph");
  await expect(list).not.toContainText("coffee");
  await page.screenshot({ path: `${SHOTS_P11}/member-notifications.png`, fullPage: true });

  // Opening the inbox reads it; the notice opens the chat.
  await page.goto("/home");
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  await page.goto("/notifications");
  await list.getByTestId("notification").filter({ hasText: "2 new messages" }).click();
  await expect(page).toHaveURL(new RegExp(`/messages/${conversationId}$`));
  await expect(page.getByText("Fancy a coffee in Sinkor?")).toBeVisible();

  // Settings: phone notifications wait for the keys (T-20); messages can be turned off.
  await page.goto("/account/notifications");
  await expect(page.getByTestId("push-unavailable")).toBeVisible();
  await page.getByLabel("Messages", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.screenshot({ path: `${SHOTS_P11}/member-notification-settings.png`, fullPage: true });
  expect(
    (
      await admin.rpc("send_message", {
        p_viewer: joseph.userId,
        p_conversation: conversationId,
        p_body: "Hello again",
      })
    ).error,
  ).toBeNull();
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", musu.userId)
    .eq("type", "MESSAGE_RECEIVED")
    .is("read_at", null);
  expect(count).toBe(0);

  await page.goto("/notifications");
  await expect(page.getByTestId("notification").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("§20 notifications: an empty inbox", async ({ page }) => {
  const errors = trackPageErrors(page);
  const hawa = await activeMember("Hawa", [IMG("musu2.jpg"), IMG("musu3.jpg"), IMG("musu1.jpg")], { gender: "WOMAN" });
  // Clear the "profile is live" notice the set-up created, to see the empty state.
  await adminClient().from("notifications").delete().eq("user_id", hawa.userId);
  await loginViaUi(page, hawa.phone);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/notifications");
  await expect(page.getByTestId("notifications-empty")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P11}/member-notifications-empty.png` });
  expect(errors).toEqual([]);
});
