import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { serverEnv } from "@/lib/env.server";

/** SMS delivery behind one interface so the provider chosen in T-04 is a drop-in adapter. */
export interface SmsProvider {
  readonly id: string;
  sendOtp(input: { phoneE164: string; code: string }): Promise<void>;
}

/**
 * Local development and tests only. Sends nothing; writes the code to a gitignored outbox file named
 * by a hash of the number so automated tests can complete sign-up. Never logs the number or code.
 */
class FakeSmsProvider implements SmsProvider {
  readonly id = "fake";
  constructor(private readonly dir: string) {}

  async sendOtp({ phoneE164, code }: { phoneE164: string; code: string }) {
    await mkdir(this.dir, { recursive: true });
    const name = createHash("sha256").update(phoneE164).digest("hex");
    await writeFile(join(this.dir, `${name}.json`), JSON.stringify({ code, at: Date.now() }), { mode: 0o600 });
  }
}

export function getSmsProvider(): SmsProvider {
  const env = serverEnv();
  switch (env.SMS_PROVIDER) {
    case "fake":
      if (env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
        throw new Error("The fake SMS provider cannot run in production. Configure the real provider (T-04).");
      }
      return new FakeSmsProvider(env.SMS_DEV_OUTBOX_DIR);
  }
}
