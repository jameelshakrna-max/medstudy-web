import { describe, it, expect } from "vitest";
import { getAllNormalizedTopics, getNormalizedTopicsForSource, VALID_SOURCES } from "../normalizedRegistry.js";
import { ALL_SOURCES } from "../sourceRegistry.js";

const all = getAllNormalizedTopics();

describe("registry integrity: normalizedTopicId format", () => {
  it("every normalizedTopicId contains exactly one '::' with non-empty parts", () => {
    for (const t of all) {
      const parts = t.normalizedTopicId.split("::");
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(parts[0]).not.toContain(":");
      expect(parts[1]).not.toContain(":");
      expect(/\s/.test(t.normalizedTopicId)).toBe(false);
    }
  });

  it("normalizedTopicId is globally unique across all sources", () => {
    const ids = all.map((t) => t.normalizedTopicId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every normalizedTopicId is scoped by a valid source id", () => {
    for (const t of all) {
      const sourcePart = t.normalizedTopicId.split("::")[0];
      expect(sourcePart).toBe(t.sourceId);
      expect(VALID_SOURCES).toContain(t.sourceId);
    }
  });
});

describe("registry integrity: canonicalTopicId stability", () => {
  it("canonicalTopicId is deterministic across independent builds", () => {
    const first = getAllNormalizedTopics();
    const second = getAllNormalizedTopics();
    expect(first.map((t) => t.canonicalTopicId)).toEqual(second.map((t) => t.canonicalTopicId));
    expect(first.map((t) => t.normalizedTopicId)).toEqual(second.map((t) => t.normalizedTopicId));
  });

  it("canonicalTopicId equals sharedTopicKey when set, otherwise equals normalizedTopicId", () => {
    for (const t of all) {
      if (t.sharedTopicKey) {
        expect(t.canonicalTopicId).toBe(t.sharedTopicKey);
      } else {
        expect(t.canonicalTopicId).toBe(t.normalizedTopicId);
      }
    }
  });

  it("per-source topic sets are stable and freeze-protected", () => {
    for (const sourceId of VALID_SOURCES) {
      const first = getNormalizedTopicsForSource(sourceId);
      const second = getNormalizedTopicsForSource(sourceId);
      expect(first.map((t) => t.canonicalTopicId)).toEqual(second.map((t) => t.canonicalTopicId));
      expect(Object.isFrozen(first)).toBe(true);
    }
  });
});

describe("registry integrity: shared topics merge exactly once", () => {
  const keyed = all.filter((t) => t.sharedTopicKey);

  it("every shared topic key spans more than one source", () => {
    const sourcesByKey = new Map();
    for (const t of keyed) {
      if (!sourcesByKey.has(t.sharedTopicKey)) sourcesByKey.set(t.sharedTopicKey, new Set());
      sourcesByKey.get(t.sharedTopicKey).add(t.sourceId);
    }
    for (const [key, sources] of sourcesByKey) {
      expect(sources.size, `shared key ${key}`).toBeGreaterThan(1);
    }
  });

  it("no two topics within one source share a canonicalTopicId", () => {
    const seen = new Set();
    for (const t of keyed) {
      const dedupeKey = `${t.sourceId}::${t.canonicalTopicId}`;
      expect(seen.has(dedupeKey)).toBe(false);
      seen.add(dedupeKey);
    }
  });

  it("every canonicalTopicId maps to exactly one sharedTopicKey", () => {
    const keyByCanonical = new Map();
    for (const t of keyed) {
      const existing = keyByCanonical.get(t.canonicalTopicId);
      expect(existing === undefined || existing === t.sharedTopicKey).toBe(true);
      keyByCanonical.set(t.canonicalTopicId, t.sharedTopicKey);
    }
  });
});

describe("registry integrity: UWorld never contributes learning minutes", () => {
  it("every source pairs with UWorld as its question source", () => {
    for (const s of ALL_SOURCES) {
      expect(s.source.questionSource).toBe("uworld");
    }
  });

  it("no normalized topic is itself a UWorld learning source", () => {
    for (const t of all) {
      expect(t.sourceId.includes("uworld")).toBe(false);
      expect(t.sourceId.includes("u-world")).toBe(false);
      expect(t.normalizedTopicId.split("::")[0].toLowerCase().includes("uworld")).toBe(false);
    }
  });

  it("learning minutes come only from the source catalog (all non-negative, finite)", () => {
    for (const t of all) {
      for (const field of ["focused", "activeLow", "activeExpected", "activeHigh", "detailedNotes"]) {
        expect(typeof t.learningMinutes[field]).toBe("number");
        expect(Number.isFinite(t.learningMinutes[field])).toBe(true);
        expect(t.learningMinutes[field] >= 0).toBe(true);
      }
    }
  });
});
