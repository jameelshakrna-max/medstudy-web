import { describe, it, expect } from "vitest";
import {
  parseDateParts,
  formatDateParts,
  addDays,
  generateDateRange,
  getDayOfWeek,
  isValidDateString,
} from "../dateUtils.js";

describe("parseDateParts", () => {
  it('returns correct year/month/day for "2026-08-15"', () => {
    const result = parseDateParts("2026-08-15");
    expect(result).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it('throws for invalid format "2026/08/15"', () => {
    expect(() => parseDateParts("2026/08/15")).toThrow();
  });

  it('throws for invalid date "2026-02-30"', () => {
    expect(() => parseDateParts("2026-02-30")).toThrow();
  });
});

describe("formatDateParts", () => {
  it("round-trips", () => {
    const parts = parseDateParts("2026-08-15");
    expect(formatDateParts(parts)).toBe("2026-08-15");
  });
});

describe("addDays", () => {
  it('crosses month boundary: "2026-01-30" + 3 === "2026-02-02"', () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it('crosses year boundary: "2026-12-30" + 5 === "2027-01-04"', () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it('non-leap year: "2026-02-28" + 1 === "2026-03-01"', () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it('leap year: "2024-02-28" + 1 === "2024-02-29"', () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it('zero days: "2026-08-01" + 0 === "2026-08-01"', () => {
    expect(addDays("2026-08-01", 0)).toBe("2026-08-01");
  });
});

describe("generateDateRange", () => {
  it('inclusivity: "2026-08-01" to "2026-08-03"', () => {
    expect(generateDateRange("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("same start and end returns single-element array", () => {
    expect(generateDateRange("2026-08-01", "2026-08-01")).toEqual([
      "2026-08-01",
    ]);
  });

  it("start > end returns empty array", () => {
    expect(generateDateRange("2026-08-05", "2026-08-01")).toEqual([]);
  });
});

describe("getDayOfWeek", () => {
  it('"2026-08-02" (Sunday) → 0', () => {
    expect(getDayOfWeek("2026-08-02")).toBe(0);
  });

  it('"2026-08-03" (Monday) → 1', () => {
    expect(getDayOfWeek("2026-08-03")).toBe(1);
  });
});

describe("isValidDateString", () => {
  it('"2026-08-15" → true', () => {
    expect(isValidDateString("2026-08-15")).toBe(true);
  });

  it('"2026/08/15" → false', () => {
    expect(isValidDateString("2026/08/15")).toBe(false);
  });

  it('"2026-02-30" → false', () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
  });

  it('"2026-13-01" → false', () => {
    expect(isValidDateString("2026-13-01")).toBe(false);
  });

  it('"" → false', () => {
    expect(isValidDateString("")).toBe(false);
  });
});
