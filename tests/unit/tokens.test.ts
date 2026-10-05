import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the real token file so the test can't drift from what ships.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--wk-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --wk-${name} not found`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG 2.1 AA: 4.5:1 for normal text. Every pairing the UI kit uses for text must pass.
describe("design token contrast (WCAG AA 4.5:1)", () => {
  const pairs: [string, string][] = [
    ["text", "bg"],
    ["text", "surface-1"],
    ["text", "surface-2"],
    ["text-muted", "bg"],
    ["text-muted", "surface-1"],
    ["primary-text", "primary-from"],
    ["primary-text", "primary-to"],
    ["primary-text", "casual"],
    ["primary-text", "relationship"],
    ["primary-text", "pending"],
    ["relationship", "bg"],
    ["casual", "bg"],
    ["verified", "bg"],
    ["success", "bg"],
    ["pending", "bg"],
    ["danger", "bg"],
  ];

  it.each(pairs)("%s on %s", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
