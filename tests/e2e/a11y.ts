import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * WCAG 2.1 A + AA checks (axe-core). Reports every violation with the selectors so a failure says
 * exactly what to fix.
 */
export async function expectAccessible(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map(
    (v) => `${label}: [${v.impact}] ${v.id} — ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}
