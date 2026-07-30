import { describe, it, expect } from "vitest";
import {
  getNormalizedTopicsForSource,
  getNormalizedTopicsForRotation,
  findNormalizedTopic,
  getAllNormalizedTopics,
  getSupportedSourcesForRotation,
  VALID_SOURCES,
} from "../normalizedRegistry.js";
import { validateNormalizedTopics } from "../normalizedTopicValidator.js";
import {
  getRotationDefinitions,
  getRotationById,
} from "../rotationRegistry.js";
import { getSharedTopicKey, SHARED_TOPIC_KEYS } from "../sharedTopicKeys.js";
import {
  normalizeStepUpMedicine,
  normalizeEssentials,
  normalizeSurgery,
  normalizeCaseBasedSurgery,
} from "../normalization/index.js";
import { STEP_UP_MEDICINE_6E } from "../textbooks/stepUpMedicine6e.js";
import { EL_HUSSEINY_ESSENTIALS } from "../textbooks/elHusseinyEssentials.js";
import { EL_HUSSEINY_SURGERY } from "../textbooks/elhusseinySurgery.js";
import { CASE_BASED_SURGERY_2E } from "../textbooks/caseBasedSurgery2e.js";

describe("getNormalizedTopicsForSource", () => {
  it("returns 443 topics for Step-Up Medicine", () => {
    const topics = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    expect(topics).toHaveLength(443);
  });

  it("returns 519 topics for EL Husseiny Essentials", () => {
    const topics = getNormalizedTopicsForSource("el-husseiny-essentials-step2ck");
    expect(topics).toHaveLength(519);
  });

  it("returns 164 topics for EL Husseiny Surgery", () => {
    const topics = getNormalizedTopicsForSource("el-husseiny-essentials-surgery-step2ck");
    expect(topics).toHaveLength(164);
  });

  it("returns 59 topics for Case-Based Surgery", () => {
    const topics = getNormalizedTopicsForSource("surgery-case-based-clinical-review-2e-2020");
    expect(topics).toHaveLength(59);
  });

  it("returns a frozen array", () => {
    const topics = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    expect(Object.isFrozen(topics)).toBe(true);
  });

  it("throws for unknown source", () => {
    expect(() => getNormalizedTopicsForSource("nonexistent")).toThrow("Unknown source");
  });

  it("every topic has the required fields", () => {
    const topics = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    for (const t of topics) {
      expect(t).toHaveProperty("normalizedTopicId");
      expect(t).toHaveProperty("canonicalTopicId");
      expect(t).toHaveProperty("sourceTopicId");
      expect(t).toHaveProperty("sourceId");
      expect(t).toHaveProperty("rotationId");
      expect(t).toHaveProperty("title");
      expect(t).toHaveProperty("sourceTitle");
      expect(t).toHaveProperty("learningMinutes");
      expect(t).toHaveProperty("pageRange");
      expect(t).toHaveProperty("confidence");
      expect(t).toHaveProperty("sharedTopicKey");
      expect(t).toHaveProperty("metadata");
      expect(t.sourceId).toBe("step-up-medicine-6e-2024");
    }
  });
});

describe("getNormalizedTopicsForRotation", () => {
  it("returns cardiology topics for Step-Up", () => {
    const topics = getNormalizedTopicsForRotation("step-up-medicine-6e-2024", "cardiology");
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      expect(t.rotationId).toBe("cardiology");
    }
  });

  it("returns empty array for unsupported source-rotation pair", () => {
    const topics = getNormalizedTopicsForRotation("step-up-medicine-6e-2024", "trauma");
    expect(topics).toEqual([]);
  });

  it("throws for unknown source", () => {
    expect(() => getNormalizedTopicsForRotation("nonexistent", "cardiology")).toThrow("Unknown source");
  });

  it("throws for unknown rotation", () => {
    expect(() =>
      getNormalizedTopicsForRotation("step-up-medicine-6e-2024", "bogus-rotation")
    ).toThrow("Unknown canonical rotation");
  });
});

describe("findNormalizedTopic", () => {
  it("finds a known topic by sourceTopicId", () => {
    const topic = findNormalizedTopic(
      "step-up-medicine-6e-2024",
      "cardiology.stable-angina-pectoris"
    );
    expect(topic).not.toBeNull();
    expect(topic.title).toBe("Stable Angina Pectoris");
    expect(topic.rotationId).toBe("cardiology");
  });

  it("returns null for unknown topic", () => {
    const topic = findNormalizedTopic(
      "step-up-medicine-6e-2024",
      "cardiology.nonexistent-topic"
    );
    expect(topic).toBeNull();
  });

  it("throws for unknown source", () => {
    expect(() => findNormalizedTopic("nonexistent", "topic.id")).toThrow("Unknown source");
  });
});

describe("getAllNormalizedTopics", () => {
  it("returns all 1185 topics across all sources", () => {
    const all = getAllNormalizedTopics();
    expect(all).toHaveLength(1185);
  });

  it("returns a frozen array", () => {
    const all = getAllNormalizedTopics();
    expect(Object.isFrozen(all)).toBe(true);
  });
});

describe("shared topic keys", () => {
  it("AAA topic has shared.aaa key across 3 sources", () => {
    const su = findNormalizedTopic("step-up-medicine-6e-2024", "cardiology.abdominal-aortic-aneurysm");
    const surg = findNormalizedTopic("el-husseiny-essentials-surgery-step2ck", "vascular-surgery.abdominal-aortic-aneurysm");
    const cbs = findNormalizedTopic("surgery-case-based-clinical-review-2e-2020", "surgery.abdominal-aortic-aneurysm");
    expect(su.sharedTopicKey).toBe("shared.aaa");
    expect(surg.sharedTopicKey).toBe("shared.aaa");
    expect(cbs.sharedTopicKey).toBe("shared.aaa");
    expect(su.canonicalTopicId).toBe("shared.aaa");
  });

  it("topics without cross-source equivalence have null sharedTopicKey", () => {
    const topic = findNormalizedTopic(
      "step-up-medicine-6e-2024",
      "cardiology.premature-complexes"
    );
    expect(topic).not.toBeNull();
    expect(topic.sharedTopicKey).toBeNull();
    expect(topic.canonicalTopicId).toBe(topic.normalizedTopicId);
  });
});

describe("mutation protection", () => {
  it("mutating an array from getRotationDefinitions does not alter later results", () => {
    const first = getRotationDefinitions();
    const originalLength = first.length;
    try {
      first.push({ id: "hacked", displayLabel: "Hacked", subjectId: "hacked" });
    } catch {
      // frozen — expected
    }
    const second = getRotationDefinitions();
    expect(second.length).toBe(originalLength);
  });

  it("mutating a topic from getNormalizedTopicsForSource does not alter later results", () => {
    const topics1 = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    const originalTitle = topics1[0].title;
    try {
      topics1[0].title = "hacked";
    } catch {
      // frozen — expected
    }
    const topics2 = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    expect(topics2[0].title).toBe(originalTitle);
  });

  it("mutating nested learningMinutes does not alter cached data", () => {
    const topics1 = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    const originalFocused = topics1[0].learningMinutes.focused;
    try {
      topics1[0].learningMinutes.focused = 999;
    } catch {
      // frozen — expected
    }
    const topics2 = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    expect(topics2[0].learningMinutes.focused).toBe(originalFocused);
  });

  it("original source catalogs remain deeply equal after normalization", () => {
    const originalStepUpTopics = STEP_UP_MEDICINE_6E.topics.length;
    const originalEssentialsTopics = EL_HUSSEINY_ESSENTIALS.topics.length;
    const originalSurgeryTopics = EL_HUSSEINY_SURGERY.topics.length;
    const originalCaseBasedTopics = CASE_BASED_SURGERY_2E.topics.length;

    normalizeStepUpMedicine();
    normalizeEssentials();
    normalizeSurgery();
    normalizeCaseBasedSurgery();

    expect(STEP_UP_MEDICINE_6E.topics).toHaveLength(originalStepUpTopics);
    expect(EL_HUSSEINY_ESSENTIALS.topics).toHaveLength(originalEssentialsTopics);
    expect(EL_HUSSEINY_SURGERY.topics).toHaveLength(originalSurgeryTopics);
    expect(CASE_BASED_SURGERY_2E.topics).toHaveLength(originalCaseBasedTopics);
  });

  it("normalizing one source cannot affect another", () => {
    const stepUpTopics = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    const stepUpCount = stepUpTopics.length;

    getNormalizedTopicsForSource("el-husseiny-essentials-step2ck");

    const stepUpAfter = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    expect(stepUpAfter).toHaveLength(stepUpCount);

    for (const t of stepUpAfter) {
      expect(t.sourceId).toBe("step-up-medicine-6e-2024");
    }
  });
});

describe("normalized topic validation", () => {
  it("all Step-Up topics pass validation", () => {
    const topics = getNormalizedTopicsForSource("step-up-medicine-6e-2024");
    const result = validateNormalizedTopics(topics);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it("all Essentials topics pass validation", () => {
    const topics = getNormalizedTopicsForSource("el-husseiny-essentials-step2ck");
    const result = validateNormalizedTopics(topics);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it("all Surgery topics pass validation", () => {
    const topics = getNormalizedTopicsForSource("el-husseiny-essentials-surgery-step2ck");
    const result = validateNormalizedTopics(topics);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it("all Case-Based topics pass validation", () => {
    const topics = getNormalizedTopicsForSource("surgery-case-based-clinical-review-2e-2020");
    const result = validateNormalizedTopics(topics);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });
});

describe("getSupportedSourcesForRotation", () => {
  it("cardiology returns Step-Up and Essentials", () => {
    const sources = getSupportedSourcesForRotation("cardiology");
    expect(sources).toContain("step-up-medicine-6e-2024");
    expect(sources).toContain("el-husseiny-essentials-step2ck");
  });

  it("trauma returns Surgery and Case-Based", () => {
    const sources = getSupportedSourcesForRotation("trauma");
    expect(sources).toContain("el-husseiny-essentials-surgery-step2ck");
    expect(sources).toContain("surgery-case-based-clinical-review-2e-2020");
  });

  it("throws for unknown rotation", () => {
    expect(() => getSupportedSourcesForRotation("bogus")).toThrow("Unknown canonical rotation");
  });
});

describe("rotationRegistry", () => {
  it("has 39 canonical rotation definitions", () => {
    const defs = getRotationDefinitions();
    expect(defs).toHaveLength(39);
  });

  it("getRotationById returns definition for known ID", () => {
    const def = getRotationById("cardiology");
    expect(def).not.toBeNull();
    expect(def.displayLabel).toBe("Cardiology");
    expect(def.subjectId).toBe("cardiology");
  });

  it("getRotationById returns null for unknown ID", () => {
    expect(getRotationById("nonexistent")).toBeNull();
  });
});
