import { expect, test } from "@playwright/test";

import { adminClient } from "./auth-helpers";
import { SHOTS_P6, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";
import { createStaff, staffSignInViaUi } from "./staff-helpers";

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const ref = (id: string) => `Account #${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

test("OD-26 / OD-33: moderators read only messages captured in a report, and every view is audited", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const fatu = await activeMember("Fatu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
    relationship: true,
  });
  const varney = await activeMember("Varney", [IMG("varney.jpg"), IMG("joseph.jpg"), IMG("prince.jpg")], {
    gender: "MAN",
    relationship: true,
  });
  await admin.rpc("like_user", { p_viewer: fatu.userId, p_target: varney.userId });
  const { data: match } = await admin.rpc("like_user", { p_viewer: varney.userId, p_target: fatu.userId });
  const conversationId = (match as { conversation_id: string }).conversation_id;
  const send = (sender: string, body: string, flagged = false) =>
    admin.rpc("send_message", {
      p_viewer: sender,
      p_conversation: conversationId,
      p_body: body,
      p_flagged: flagged,
      p_categories: flagged ? ["MONEY_REQUEST"] : [],
    });
  expect((await send(fatu.userId, "Hi Varney, how was your week?")).error).toBeNull();
  expect((await send(varney.userId, "Good! Can you send me 30 USD for transport?", true)).error).toBeNull();
  // A message after the report must never reach staff.
  const { data: reportId, error } = await admin.rpc("submit_conversation_report", {
    p_reporter: fatu.userId,
    p_conversation: conversationId,
    p_category: "MONEY_SCAM",
  });
  expect(error).toBeNull();
  expect((await send(fatu.userId, "Sorry, I don't send money.")).error).toBeNull();

  const moderator = await createStaff("MODERATOR");
  await staffSignInViaUi(page, moderator);

  // The message flag shows the sender's account, never the text.
  await page.goto("/admin/flags");
  const flag = page.getByRole("listitem").filter({ hasText: ref(varney.userId) });
  await expect(flag).toContainText("Money terms in a message");
  await expect(page.getByText("30 USD")).toHaveCount(0);

  await page.goto(`/admin/reports?id=${reportId}`);
  const panel = page.getByRole("region", { name: "Report" });
  await expect(panel.getByText("2 recent messages captured. Opening them is logged.")).toBeVisible();
  await expect(panel.getByText("30 USD")).toHaveCount(0);
  const before = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "REPORTED_MESSAGES_VIEWED")
    .eq("entity_id", String(reportId));
  expect(before.count).toBe(0);
  await panel.getByRole("button", { name: "Show captured messages" }).click();
  const list = panel.getByRole("list", { name: "Captured messages" });
  await expect(list.getByText("Good! Can you send me 30 USD for transport?")).toBeVisible();
  await expect(list.getByText("Sorry, I don't send money.")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS_P6}/admin-report-messages.png` });
  const { data: audit } = await admin
    .from("audit_logs")
    .select("actor_id, metadata")
    .eq("action", "REPORTED_MESSAGES_VIEWED")
    .eq("entity_id", String(reportId));
  expect(audit).toHaveLength(1);
  expect(audit![0].actor_id).toBe(moderator.id);
  expect(JSON.stringify(audit)).not.toContain("USD");
  expect(errors).toEqual([]);
});
