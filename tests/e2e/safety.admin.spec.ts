import { expect, test } from "@playwright/test";

import { adminClient } from "./auth-helpers";
import { SHOTS_P5, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";
import { createStaff, staffSignInViaUi } from "./staff-helpers";

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const ref = (id: string) => `Account #${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

async function report(reporter: string, target: string, category: string, description?: string) {
  const { error } = await adminClient().rpc("submit_report", {
    p_reporter: reporter,
    p_target: target,
    p_category: category as "SPAM",
    p_description: description,
  });
  expect(error).toBeNull();
}

test("§21 reports queue: a moderator investigates, notes and dismisses an under-18 report, restoring visibility (BR-32, BR-34)", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const reporter = await activeMember("Comfort", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")]);
  const target = await activeMember("Emmanuel", [IMG("emmanuel.jpg"), IMG("joseph.jpg"), IMG("prince.jpg")]);
  await report(reporter.userId, target.userId, "UNDER_18", "Says he is in 10th grade.");
  const admin = adminClient();
  expect((await admin.from("users").select("hidden_reason").eq("id", target.userId).single()).data?.hidden_reason).toBe(
    "UNDER_18_REPORT",
  );

  const moderator = await createStaff("MODERATOR");
  await staffSignInViaUi(page, moderator);
  await expect(page.getByTestId("reports-open")).not.toHaveText("0");
  await page.goto("/admin/reports?priority=HIGH");
  const row = page.getByRole("row", { name: new RegExp(ref(target.userId)) });
  await expect(row).toContainText("Appears under 18");
  await expect(row).toContainText("Auto-hidden");
  await row.getByRole("link").click();

  const panel = page.getByRole("region", { name: "Report" });
  await expect(panel.getByText(ref(target.userId))).toBeVisible();
  await expect(panel.getByText("Says he is in 10th grade.")).toBeVisible();
  await expect(panel.getByText("Hidden: under-18 report")).toBeVisible();
  await expect(panel.getByRole("img", { name: "Member photo" })).toHaveCount(3);
  // §7: moderators can't ban.
  await expect(panel.getByRole("button", { name: "Ban", exact: true })).toHaveCount(0);
  await panel.getByRole("textbox", { name: "Internal note" }).fill("Photos and verified selfie show an adult.");
  await panel.getByRole("button", { name: "Add note" }).click();
  await expect(panel.getByText("Photos and verified selfie show an adult.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P5}/admin-reports.png` });

  await panel.getByLabel("Also make the member visible again").check();
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await expect(panel.getByText(/· dismissed/)).toBeVisible();

  const { data: after } = await admin.from("users").select("hidden_reason").eq("id", target.userId).single();
  expect(after?.hidden_reason).toBeNull();
  const { data: audit } = await admin
    .from("audit_logs")
    .select("actor_id, metadata")
    .eq("action", "REPORT_RESOLVED")
    .eq("entity_type", "report");
  expect(
    audit?.some(
      (a) => a.actor_id === moderator.id && (a.metadata as { visibility_restored?: boolean }).visibility_restored,
    ),
  ).toBe(true);
  // Member text stays out of the audit log.
  expect(JSON.stringify(audit)).not.toContain("10th grade");
  expect(errors).toEqual([]);
});

test("§8 / BR-6: an admin bans from a report; the account is signed out and the phone can't sign up again", async ({
  page,
}) => {
  const reporter = await activeMember("Fatu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")]);
  const target = await activeMember("Varney", [IMG("varney.jpg"), IMG("joseph.jpg"), IMG("prince.jpg")]);
  await report(reporter.userId, target.userId, "SELLING_SEX");
  const admin = adminClient();

  const staff = await createStaff("ADMIN");
  await staffSignInViaUi(page, staff);
  await page.goto("/admin/reports?priority=HIGH");
  await page
    .getByRole("row", { name: new RegExp(ref(target.userId)) })
    .getByRole("link")
    .click();
  const panel = page.getByRole("region", { name: "Report" });
  await panel.getByRole("button", { name: "Ban", exact: true }).click();
  // A ban needs an explicit confirmation and a reason.
  await expect(panel.getByRole("alert").filter({ hasText: "Tick the box" })).toHaveText(
    "Tick the box to confirm the ban.",
  );
  await panel.getByLabel(/Ends their sessions/).check();
  await panel.getByRole("button", { name: "Ban", exact: true }).click();
  await expect(panel.getByRole("alert").filter({ hasText: "reason" })).toHaveText("Choose a reason.");
  await panel.getByLabel(/Ends their sessions/).check();
  await panel.getByLabel("Ban reason").selectOption("SELLING_SEX");
  await panel.getByRole("button", { name: "Ban", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Lift ban" })).toBeVisible();

  const { data: user } = await admin.from("users").select("status").eq("id", target.userId).single();
  expect(user?.status).toBe("BANNED");
  const { data: authUser } = await admin.auth.admin.getUserById(target.userId);
  expect(new Date(authUser.user!.banned_until!).getTime()).toBeGreaterThan(Date.now());
  const { data: geo } = await admin.rpc("begin_signup", {
    p_phone: target.phone.e164,
    p_ip_country: "LR",
    p_ip: "203.0.113.201",
  });
  expect(geo).toBe("BLOCKED_LIST");
  const { data: audit } = await admin
    .from("audit_logs")
    .select("metadata")
    .eq("action", "USER_BANNED")
    .eq("entity_id", target.userId)
    .single();
  expect((audit?.metadata as { reason: string }).reason).toBe("SELLING_SEX");

  // Restoring lifts the ban and the blocklist entry (admin only, audited).
  await panel.getByRole("button", { name: "Lift ban" }).click();
  await expect(panel.getByRole("button", { name: "Ban", exact: true })).toBeVisible();
  const { data: geo2 } = await admin.rpc("begin_signup", {
    p_phone: target.phone.e164,
    p_ip_country: "LR",
    p_ip: "203.0.113.201",
  });
  expect(geo2).toBe("PASS");
});

test("§17 / §21 flags queue: many reports raise a flag; a moderator suspends and resolves it (BR-5)", async ({
  page,
}) => {
  const target = await activeMember("Joseph", [IMG("joseph.jpg"), IMG("varney.jpg"), IMG("prince.jpg")]);
  const reporters = await Promise.all(
    ["Siah", "Kemah", "Jartu"].map((n) => activeMember(n, [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("kemah.jpg")])),
  );
  for (const r of reporters) await report(r.userId, target.userId, "SPAM");
  const admin = adminClient();
  // LOW reports never hide, but three reporters raise a MANY_REPORTS flag.
  expect(
    (await admin.from("users").select("hidden_reason").eq("id", target.userId).single()).data?.hidden_reason,
  ).toBeNull();

  const moderator = await createStaff("MODERATOR");
  await staffSignInViaUi(page, moderator);
  await page.goto("/admin/flags");
  const flag = page.getByRole("listitem").filter({ hasText: ref(target.userId) });
  await expect(flag).toContainText("Many reports");
  await page.screenshot({ path: `${SHOTS_P5}/admin-flags.png` });

  // Suspend from one of the reports, then resolve the flag.
  await page.goto("/admin/reports?priority=LOW");
  await page
    .getByRole("row", { name: new RegExp(ref(target.userId)) })
    .first()
    .getByRole("link")
    .click();
  const panel = page.getByRole("region", { name: "Report" });
  await panel.getByLabel("Suspension length").selectOption("3");
  await panel.getByRole("button", { name: "Suspend" }).click();
  await expect(panel.getByText(/· suspended until/)).toBeVisible();
  const { data: status } = await admin.rpc("member_profile_for_viewer", {
    p_viewer: reporters[0].userId,
    p_owner: target.userId,
  });
  expect(status).toBeNull();

  await page.goto("/admin/flags");
  await flag.getByRole("button", { name: "Resolve" }).click();
  await expect(flag).toHaveCount(0);
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "USER_SUSPENDED")
    .eq("entity_id", target.userId);
  expect(count).toBe(1);
});
