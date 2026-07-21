import { describe, it, expect } from "vitest";
import {
  getStudySource,
  getAvailableStudySources,
  getSourcesForRotation,
  ALL_SOURCES,
} from "../sourceRegistry.js";
import { validateAllSources, VALID_ROTATION_IDS } from "../sourceValidator.js";

describe("getStudySource", () => {
  it("returns source for known source id", () => {
    const source = getStudySource("step-up-medicine-6e-2024");
    expect(source).not.toBeNull();
    expect(source.source.id).toBe("step-up-medicine-6e-2024");
  });

  it("returns null for unknown source id", () => {
    const source = getStudySource("nonexistent-source");
    expect(source).toBeNull();
  });
});

describe("getAvailableStudySources", () => {
  const summaries = getAvailableStudySources();

  it("returns all 4 sources", () => {
    expect(summaries).toHaveLength(4);
  });

  it("each summary has correct shape", () => {
    for (const s of summaries) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("edition");
      expect(s).toHaveProperty("year");
      expect(s).toHaveProperty("version");
      expect(s).toHaveProperty("type");
      expect(s).toHaveProperty("questionSource");
      expect(s).toHaveProperty("supportedRotations");
      expect(s).toHaveProperty("topicCount");
      expect(typeof s.id).toBe("string");
      expect(typeof s.title).toBe("string");
      expect(Array.isArray(s.supportedRotations)).toBe(true);
      expect(typeof s.topicCount).toBe("number");
    }
  });

  it("all sources have questionSource resolved", () => {
    for (const s of summaries) {
      expect(s.questionSource).toBe("uworld");
    }
  });
});

describe("getSourcesForRotation", () => {
  it("cardiology returns Step-Up Medicine and EL Husseiny Essentials", () => {
    const sources = getSourcesForRotation("cardiology");
    const ids = sources.map(s => s.id).sort();
    expect(ids).toEqual([
      "el-husseiny-essentials-step2ck",
      "step-up-medicine-6e-2024",
    ]);
  });

  it("trauma returns EL Husseiny Surgery and Case-Based Surgery", () => {
    const sources = getSourcesForRotation("trauma");
    const ids = sources.map(s => s.id).sort();
    expect(ids).toEqual([
      "el-husseiny-essentials-surgery-step2ck",
      "surgery-case-based-clinical-review-2e-2020",
    ]);
  });

  it("orthopedic-surgery returns EL Husseiny Surgery and Case-Based Surgery", () => {
    const sources = getSourcesForRotation("orthopedic-surgery");
    const ids = sources.map(s => s.id).sort();
    expect(ids).toEqual([
      "el-husseiny-essentials-surgery-step2ck",
      "surgery-case-based-clinical-review-2e-2020",
    ]);
  });

  it("general-surgery returns EL Husseiny Surgery only", () => {
    const sources = getSourcesForRotation("general-surgery");
    const ids = sources.map(s => s.id);
    expect(ids).toEqual(["el-husseiny-essentials-surgery-step2ck"]);
  });

  it("returns empty array for nonexistent rotation", () => {
    const sources = getSourcesForRotation("nonexistent-rotation-id");
    expect(sources).toEqual([]);
  });

  it("acute-care-surgery returns Case-Based Surgery only", () => {
    const sources = getSourcesForRotation("acute-care-surgery");
    const ids = sources.map(s => s.id);
    expect(ids).toEqual(["surgery-case-based-clinical-review-2e-2020"]);
  });

  it("does not conflate cardiothoracic-surgery with cardiology", () => {
    const cardiology = getSourcesForRotation("cardiology");
    const cardiothoracic = getSourcesForRotation("cardiothoracic-surgery");
    const cardioIds = cardiology.map(s => s.id);
    const cardioThorIds = cardiothoracic.map(s => s.id);
    expect(cardioIds).not.toContain("surgery-case-based-clinical-review-2e-2020");
    expect(cardioThorIds).toContain("surgery-case-based-clinical-review-2e-2020");
  });
});

describe("validateAllSources", () => {
  it("validates all 4 real sources without errors", () => {
    const result = validateAllSources(ALL_SOURCES);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("detects duplicate source IDs", () => {
    const dupeSources = [
      ALL_SOURCES[0],
      { ...ALL_SOURCES[0], topics: [] },
    ];
    const result = validateAllSources(dupeSources);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "DUPLICATE_SOURCE_ID")).toBe(true);
  });

  it("detects duplicate topic IDs within the same source", () => {
    const source = { ...ALL_SOURCES[0] };
    const topic = source.topics[0];
    if (topic) {
      source.topics = [topic, { ...topic }];
      const result = validateAllSources([source]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "DUPLICATE_TOPIC_ID")).toBe(true);
    }
  });

  it("allows same topic_id across different sources", () => {
    if (ALL_SOURCES.length >= 2) {
      const source1 = ALL_SOURCES[0];
      const source2 = ALL_SOURCES[1];
      const topic1 = source1.topics?.find(t => t.topic_id);
      const topic2 = source2.topics?.find(t => t.topic_id);

      if (topic1 && topic2 && topic1.topic_id && topic2.topic_id) {
        const testSources = [
          { ...source1, topics: [topic1] },
          { ...source2, topics: [{ ...topic2, topic_id: topic1.topic_id }] },
        ];
        const result = validateAllSources(testSources);
        const dupeErrors = result.errors.filter(e => e.code === "DUPLICATE_TOPIC_ID");
        expect(dupeErrors).toHaveLength(0);
      }
    }
  });

  it("detects missing metadata keys", () => {
    const source = { source: { id: "test-source" }, topics: [] };
    const result = validateAllSources([source]);
    expect(result.valid).toBe(false);
    const missingKeys = result.errors
      .filter(e => e.code === "MISSING_METADATA_KEY")
      .map(e => e.path);
    expect(missingKeys).toContain("source.edition");
    expect(missingKeys).toContain("source.supportedRotations");
  });

  it("detects missing time estimates in topics", () => {
    const source = {
      source: {
        id: "test-source",
        edition: null,
        year: null,
        version: "1.0.0",
        questionSource: "uworld",
        supportedRotations: ["cardiology"],
      },
      topics: [
        {
          topic_id: "test.topic",
          heading_kind: "topic",
        },
      ],
    };
    const result = validateAllSources([source]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_TIME_ESTIMATE")).toBe(true);
  });

  it("detects negative time values", () => {
    const source = {
      source: {
        id: "test-source",
        edition: null,
        year: null,
        version: "1.0.0",
        questionSource: "uworld",
        supportedRotations: ["cardiology"],
      },
      topics: [
        {
          topic_id: "test.topic",
          focused_minutes: -1,
          active_minutes: 10,
          detailed_notes_minutes: 10,
        },
      ],
    };
    const result = validateAllSources([source]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "INVALID_TIME_VALUE")).toBe(true);
  });

  it("detects unsupported rotation IDs", () => {
    const source = {
      source: {
        id: "test-source",
        edition: null,
        year: null,
        version: "1.0.0",
        questionSource: "uworld",
        supportedRotations: ["bogus-rotation"],
      },
      topics: [],
    };
    const result = validateAllSources([source]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "UNSUPPORTED_ROTATION_ID")).toBe(true);
  });

  it("detects missing questionSource", () => {
    const source = {
      source: {
        id: "test-source",
        edition: null,
        year: null,
        version: "1.0.0",
        supportedRotations: ["cardiology"],
      },
      topics: [],
    };
    const result = validateAllSources([source]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_QUESTION_SOURCE")).toBe(true);
  });
});

describe("VALID_ROTATION_IDS", () => {
  it("includes all canonical rotation IDs used by sources", () => {
    const allUsed = new Set(
      ALL_SOURCES.flatMap(s => s.source.supportedRotations ?? [])
    );
    for (const id of allUsed) {
      expect(VALID_ROTATION_IDS).toContain(id);
    }
  });
});
