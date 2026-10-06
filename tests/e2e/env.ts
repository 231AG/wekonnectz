import { existsSync, readFileSync } from "node:fs";

/** Loads .env.local (written by `pnpm env:setup`) for Playwright and test helpers. Values are never printed. */
export function loadLocalEnv(): Record<string, string> {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
