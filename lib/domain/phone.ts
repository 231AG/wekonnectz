import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Liberian phone rules (BR-2). Pure: no Next.js or Supabase imports.
 * Accepts local (0770…), national (770…) and international (+231 770…) input.
 */

export const LIBERIA_CALLING_CODE = "231";

export type PhoneCheck = { ok: true; e164: string } | { ok: false; reason: "INVALID" | "NOT_LIBERIAN" };

export function checkLiberianPhone(input: string): PhoneCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "INVALID" };
  // A number written with a different country code is never Liberian, even if it parses.
  if (/^(\+|00)/.test(trimmed) && !/^(\+|00)\s*231/.test(trimmed)) return { ok: false, reason: "NOT_LIBERIAN" };
  const parsed = parsePhoneNumberFromString(trimmed.replace(/^00/, "+"), "LR");
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "INVALID" };
  if (parsed.countryCallingCode !== LIBERIA_CALLING_CODE) return { ok: false, reason: "NOT_LIBERIAN" };
  return { ok: true, e164: parsed.number };
}

/** "+231770123456" → "+231 77 •• •• 456" style mask for display (mock-up: "77 • • • • 452"). */
export function maskPhone(e164: string): string {
  const national = e164.startsWith("+231") ? e164.slice(4) : e164;
  if (national.length < 5) return "•••";
  return `+231 ${national.slice(0, 2)} • • • • ${national.slice(-3)}`;
}
