import { describe, it, expect, vi } from "vitest";
import {
  getBrowserTimezone,
  isValidTimezone,
  resolvePlannerTimezone,
  getDateKeyInTimezone,
  getTodayKey,
  isOverdue,
  secondsToPlannerMinutes,
} from "../todayUtils";

describe("getBrowserTimezone", () => {
  it("returns a non-empty string", () => {
    const tz = getBrowserTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });

  it("returns a valid IANA timezone", () => {
    expect(isValidTimezone(getBrowserTimezone())).toBe(true);
  });
});

describe("isValidTimezone", () => {
  it("returns true for valid IANA zones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidTimezone("Not/A/Timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("FooBar")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe("resolvePlannerTimezone", () => {
  it("returns profileTimezone when valid", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: "America/New_York",
      applicationTimezone: "Europe/London",
      browserTimezone: "Asia/Tokyo",
    });
    expect(result).toBe("America/New_York");
  });

  it("falls back to applicationTimezone when profile is invalid", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: "Bad/Zone",
      applicationTimezone: "Europe/London",
      browserTimezone: "Asia/Tokyo",
    });
    expect(result).toBe("Europe/London");
  });

  it("falls back to browserTimezone when profile and application are invalid", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: "Bad/Zone",
      applicationTimezone: "Also/Bad",
      browserTimezone: "Asia/Tokyo",
    });
    expect(result).toBe("Asia/Tokyo");
  });

  it("falls back to UTC when all are invalid", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: "Bad/Zone",
      applicationTimezone: "Also/Bad",
      browserTimezone: "Nope/Nope",
    });
    expect(result).toBe("UTC");
  });

  it("falls back to UTC when all are undefined", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: undefined,
      applicationTimezone: undefined,
      browserTimezone: undefined,
    });
    expect(result).toBe("UTC");
  });

  it("skips undefined/null values in the chain", () => {
    const result = resolvePlannerTimezone({
      profileTimezone: null,
      applicationTimezone: undefined,
      browserTimezone: "Europe/Berlin",
    });
    expect(result).toBe("Europe/Berlin");
  });
});

describe("getDateKeyInTimezone", () => {
  it("returns YYYY-MM-DD for UTC midnight", () => {
    const date = new Date("2025-07-15T00:00:00Z");
    expect(getDateKeyInTimezone(date, "UTC")).toBe("2025-07-15");
  });

  it("returns correct date for a timezone ahead of UTC", () => {
    // 23:30 UTC on July 14 is already July 15 in UTC+9
    const date = new Date("2025-07-14T23:30:00Z");
    expect(getDateKeyInTimezone(date, "Asia/Tokyo")).toBe("2025-07-15");
  });

  it("returns correct date for a timezone behind UTC", () => {
    // 03:30 UTC on July 15 is July 14 23:30 EDT (UTC-4 in July)
    const date = new Date("2025-07-15T03:30:00Z");
    expect(getDateKeyInTimezone(date, "America/New_York")).toBe("2025-07-14");
  });

  it("handles month/year boundaries", () => {
    // 2025-01-01 00:00 UTC is 2024-12-31 in UTC-5
    const date = new Date("2025-01-01T00:00:00Z");
    expect(getDateKeyInTimezone(date, "America/New_York")).toBe("2024-12-31");
  });

  it("pads month and day to two digits", () => {
    const date = new Date("2025-03-05T12:00:00Z");
    const key = getDateKeyInTimezone(date, "UTC");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getTodayKey", () => {
  it("returns the date key for the supplied now", () => {
    const now = new Date("2025-09-20T14:30:00Z");
    expect(getTodayKey(now, "UTC")).toBe("2025-09-20");
  });

  it("respects timezone offset", () => {
    const now = new Date("2025-09-20T03:00:00Z");
    // UTC+9 → already Sep 20
    expect(getTodayKey(now, "Asia/Tokyo")).toBe("2025-09-20");
    // UTC-5 → still Sep 19
    expect(getTodayKey(now, "America/New_York")).toBe("2025-09-19");
  });

  it("is pure — does not use system clock", () => {
    const arbitrary = new Date("1999-12-31T23:59:59Z");
    expect(getTodayKey(arbitrary, "UTC")).toBe("1999-12-31");
  });
});

describe("isOverdue", () => {
  it("returns true when task is before today", () => {
    expect(isOverdue("2025-07-14", "2025-07-15")).toBe(true);
  });

  it("returns false when task is equal to today", () => {
    expect(isOverdue("2025-07-15", "2025-07-15")).toBe(false);
  });

  it("returns false when task is after today", () => {
    expect(isOverdue("2025-07-16", "2025-07-15")).toBe(false);
  });

  it("works across year boundaries", () => {
    expect(isOverdue("2024-12-31", "2025-01-01")).toBe(true);
    expect(isOverdue("2025-01-01", "2024-12-31")).toBe(false);
  });

  it("lexicographic string comparison matches calendar ordering", () => {
    expect(isOverdue("2025-01-01", "2025-12-31")).toBe(true);
    expect(isOverdue("2025-12-31", "2025-01-01")).toBe(false);
  });
});

describe("secondsToPlannerMinutes", () => {
  it("converts exact minutes", () => {
    expect(secondsToPlannerMinutes(120)).toBe(2);
    expect(secondsToPlannerMinutes(60)).toBe(1);
    expect(secondsToPlannerMinutes(0)).toBe(0);
  });

  it("rounds up fractional minutes", () => {
    expect(secondsToPlannerMinutes(61)).toBe(2);
    expect(secondsToPlannerMinutes(90)).toBe(2);
    expect(secondsToPlannerMinutes(119)).toBe(2);
    expect(secondsToPlannerMinutes(1)).toBe(1);
  });

  it("handles large values", () => {
    expect(secondsToPlannerMinutes(3600)).toBe(60);
    expect(secondsToPlannerMinutes(3661)).toBe(62);
  });
});

describe("default export", () => {
  it("contains all functions", () => {
    import("../todayUtils").then((mod) => {
      expect(typeof mod.default.getBrowserTimezone).toBe("function");
      expect(typeof mod.default.isValidTimezone).toBe("function");
      expect(typeof mod.default.resolvePlannerTimezone).toBe("function");
      expect(typeof mod.default.getDateKeyInTimezone).toBe("function");
      expect(typeof mod.default.getTodayKey).toBe("function");
      expect(typeof mod.default.isOverdue).toBe("function");
      expect(typeof mod.default.secondsToPlannerMinutes).toBe("function");
    });
  });
});
