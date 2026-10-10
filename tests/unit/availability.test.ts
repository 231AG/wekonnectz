import { describe, expect, it } from "vitest";

import { checkWindow, formatWindowTime, parseLiberiaLocal, toLiberiaLocal } from "@/lib/domain/availability";

const NOW = new Date("2026-10-10T18:00:00Z");
const CAPS = { maxWindowHours: 12, maxLeadDays: 7 };
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("BR-17 / BR-18 availability windows (spec §12)", () => {
  it("reads datetime-local values as Liberia time (GMT) and writes them back", () => {
    expect(parseLiberiaLocal("2026-10-10T23:00")?.toISOString()).toBe("2026-10-10T23:00:00.000Z");
    expect(parseLiberiaLocal("10/10/2026 23:00")).toBeNull();
    expect(parseLiberiaLocal("")).toBeNull();
    expect(toLiberiaLocal(new Date("2026-10-10T23:00:00Z"))).toBe("2026-10-10T23:00");
  });

  it("BR-18: Available now runs from now to the chosen end", () => {
    expect(checkWindow(null, at(5), NOW, CAPS)).toBeNull();
    expect(checkWindow(null, null, NOW, CAPS)).toBe("END_REQUIRED");
    expect(checkWindow(null, at(-1), NOW, CAPS)).toBe("END_BEFORE_START");
  });

  it("OD-8: windows longer than the cap or too far ahead are refused", () => {
    expect(checkWindow(null, at(12), NOW, CAPS)).toBeNull();
    expect(checkWindow(null, at(12.1), NOW, CAPS)).toBe("WINDOW_TOO_LONG");
    expect(checkWindow(at(7 * 24), at(7 * 24 + 2), NOW, CAPS)).toBeNull();
    expect(checkWindow(at(7 * 24 + 1), at(7 * 24 + 2), NOW, CAPS)).toBe("TOO_FAR_AHEAD");
  });

  it("a schedule can't start in the past (a few minutes' slack means now)", () => {
    expect(checkWindow(at(-1), at(2), NOW, CAPS)).toBe("START_IN_PAST");
    expect(checkWindow(new Date(NOW.getTime() - 2 * 60_000), at(2), NOW, CAPS)).toBeNull();
  });

  it("without OD-8 values the form doesn't guess limits (the server refuses)", () => {
    expect(checkWindow(null, at(30), NOW, { maxWindowHours: null, maxLeadDays: null })).toBeNull();
  });

  it("shows times the way the mock-up does", () => {
    expect(formatWindowTime("2026-10-10T23:00:00Z", NOW)).toBe("11:00 PM");
    expect(formatWindowTime("2026-10-11T09:30:00Z", NOW)).toBe("Sun 11 Oct, 9:30 AM");
  });
});

describe("Available now: until a clock time", () => {
  it("BR-18: later today, or tomorrow once the time has passed; a time just passed is refused", async () => {
    const { endFromClockTime } = await import("@/lib/domain/availability");
    expect(endFromClockTime("23:00", NOW)?.toISOString()).toBe("2026-10-10T23:00:00.000Z");
    expect(endFromClockTime("02:00", NOW)?.toISOString()).toBe("2026-10-11T02:00:00.000Z");
    expect(endFromClockTime("17:00", NOW)?.toISOString()).toBe("2026-10-11T17:00:00.000Z");
    expect(endFromClockTime("18:00", NOW)).toBeNull();
    expect(endFromClockTime("17:57", NOW)).toBeNull();
    expect(endFromClockTime("25:00", NOW)).toBeNull();
    expect(endFromClockTime("", NOW)).toBeNull();
  });
});
