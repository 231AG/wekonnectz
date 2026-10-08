import { randomInt } from "node:crypto";

import sharp from "sharp";
import { expect, test } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P7, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§16: a member pays outside the app and submits a claim with a screenshot; nothing is granted yet (BR-26)", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const member = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
  });
  const admin = adminClient();
  await loginViaUi(page, member.phone);
  await expect(page).toHaveURL(/\/home$/);

  await page.goto("/casual");
  await expect(page.getByTestId("pass-status")).toHaveText("Casual needs a pass");
  await page.getByRole("link", { name: "Get a pass" }).click();
  await expect(page).toHaveURL(/\/casual\/get-access$/);
  await expect(page.getByText("7-Day Pass")).toBeVisible();
  await expect(page.getByText("Card · soon")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P7}/member-get-access-choose-plan.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  // Instructions: wallet number, exact amount, reference code.
  await expect(page).toHaveURL(/\/casual\/get-access\/pay\?/);
  await expect(page.getByTestId("amount")).toHaveText("$5.00");
  await expect(page.getByTestId("merchant-number")).toBeVisible();
  await expect(page.getByTestId("reference-code")).toHaveText(/^WK-[A-Z0-9]{4}$/);
  await expect(page.getByLabel("Number you paid from")).toHaveValue(member.phone.e164);
  await expect(page.getByLabel("Amount")).toHaveValue("$5.00 (USD)");
  await page.screenshot({ path: `${SHOTS_P7}/member-momo-instructions.png`, fullPage: true });

  const txn = `OM${randomInt(10_000_000, 99_999_999)}`;
  await page.getByLabel("Transaction ID").fill(txn);
  await page.getByLabel("When you paid").fill(new Date(Date.now() - 3600_000).toISOString().slice(0, 16));
  const receipt = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#f5f5f5" } })
    .png()
    .toBuffer();
  await page
    .getByTestId("evidence-input")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: receipt });
  await expect(page.getByRole("img", { name: "Your payment screenshot" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P7}/member-submit-claim.png`, fullPage: true });
  await page.getByRole("button", { name: "Submit payment" }).click();

  await expect(page).toHaveURL(/\/me\/payments\?submitted=1$/, { timeout: 30_000 });
  await expect(page.getByText("Payment submitted — we’re verifying it.")).toBeVisible();
  await expect(page.getByText("We usually verify payments within 24 hours.").first()).toBeVisible();
  await expect(page.getByTestId("claim").first()).toContainText("Checking");
  await page.screenshot({ path: `${SHOTS_P7}/member-claim-status-pending.png`, fullPage: true });

  // Stored privately as a processed WebP with its hash; the page never shows a storage path.
  const { data: claim } = await admin
    .from("payment_claims")
    .select("status, amount, currency, evidence_path, evidence_sha256, transaction_id")
    .eq("user_id", member.userId)
    .single();
  expect(claim).toMatchObject({ status: "PENDING_REVIEW", amount: 5, currency: "USD", transaction_id: txn });
  expect(claim!.evidence_sha256).toMatch(/^[0-9a-f]{64}$/);
  const { data: file } = await admin.storage.from("payment-evidence").download(claim!.evidence_path!);
  expect((await sharp(Buffer.from(await file!.arrayBuffer())).metadata()).format).toBe("webp");
  expect(await page.content()).not.toContain(claim!.evidence_path!);
  // BR-26: a claim alone grants nothing.
  const { data: access } = await admin.rpc("has_casual_access", { p_user: member.userId });
  expect(access).toBe(false);
  expect(errors).toEqual([]);
});
