import { describe, it, expect } from "vitest";
import {
  isV2Plan,
  mapActivityType,
  mapV1Status,
  normalizePlanResponse,
} from "../responseAdapters";

describe("isV2Plan", () => {
  it("returns true when plan has version === 2", () => {
    expect(isV2Plan({ id: "1", version: 2 })).toBe(true);
  });

  it("returns true when plan has tasks array", () => {
    expect(isV2Plan({ id: "1", tasks: [] })).toBe(true);
  });

  it("returns true when plan has both version and tasks", () => {
    expect(isV2Plan({ id: "1", version: 2, tasks: [] })).toBe(true);
  });

  it("returns false for V1 plan", () => {
    expect(isV2Plan({ id: "1", version: 1 })).toBe(false);
  });

  it("returns false for plan with no version and no tasks", () => {
    expect(isV2Plan({ id: "1" })).toBe(false);
  });

  it("returns false for null/undefined/non-object", () => {
    expect(isV2Plan(null)).toBe(false);
    expect(isV2Plan(undefined)).toBe(false);
    expect(isV2Plan("string")).toBe(false);
  });
});

describe("mapActivityType", () => {
  it("maps study to learning", () => {
    expect(mapActivityType("study")).toBe("learning");
  });

  it("maps uworld to uworld_questions", () => {
    expect(mapActivityType("uworld")).toBe("uworld_questions");
  });

  it("maps flashcards to flashcard_review", () => {
    expect(mapActivityType("flashcards")).toBe("flashcard_review");
  });

  it("maps mixed to mixed_review", () => {
    expect(mapActivityType("mixed")).toBe("mixed_review");
  });

  it("defaults to learning for unknown types", () => {
    expect(mapActivityType("unknown")).toBe("learning");
    expect(mapActivityType(null)).toBe("learning");
    expect(mapActivityType(undefined)).toBe("learning");
  });
});

describe("mapV1Status", () => {
  it("maps completed to completed", () => {
    expect(mapV1Status("completed")).toBe("completed");
  });

  it("maps in_progress to in_progress", () => {
    expect(mapV1Status("in_progress")).toBe("in_progress");
  });

  it("defaults to pending for unknown statuses", () => {
    expect(mapV1Status("not_started")).toBe("pending");
    expect(mapV1Status(null)).toBe("pending");
    expect(mapV1Status(undefined)).toBe("pending");
  });
});

describe("normalizePlanResponse", () => {
  it("returns empty shape for null/undefined input", () => {
    const result = normalizePlanResponse(null);
    expect(result).toEqual({ key: "", version: 1, plan: null, tasks: [], schedule: [], progress: [], availability: [] });
  });

  it("returns empty shape for non-object input", () => {
    const result = normalizePlanResponse("bad");
    expect(result.key).toBe("");
    expect(result.tasks).toEqual([]);
  });

  describe("V1 plan", () => {
    const v1Response = {
      plan: { id: "plan-1", version: 1 },
      schedule: [
        {
          id: "entry-1",
          date: "2025-07-15",
          activity_type: "uworld",
          sort_order: 1,
          status: "completed",
          estimated_minutes: 60,
          description: "UWorld Block 1",
          uworld_questions: 40,
          uworld_mode: "tutor",
        },
        {
          id: "entry-2",
          date: "2025-07-15",
          activity_type: "flashcards",
          sort_order: 2,
          status: "in_progress",
          estimated_minutes: 30,
          description: "Anki review",
          uworld_questions: null,
          uworld_mode: null,
        },
        {
          id: "entry-3",
          date: "2025-07-15",
          activity_type: "study",
          sort_order: 3,
          status: "pending",
          estimated_minutes: 45,
          description: "Read chapter",
          uworld_questions: null,
          uworld_mode: null,
        },
      ],
      progress: [{ topicId: "t1", percentage: 50 }],
      availability: [{ date: "2025-07-15", available: true }],
    };

    it("detects version 1", () => {
      const result = normalizePlanResponse(v1Response);
      expect(result.version).toBe(1);
      expect(result.key).toBe("plan-1");
    });

    it("preserves original schedule", () => {
      const result = normalizePlanResponse(v1Response);
      expect(result.schedule).toEqual(v1Response.schedule);
    });

    it("normalizes completed entry correctly", () => {
      const result = normalizePlanResponse(v1Response);
      const task = result.tasks[0];
      expect(task.id).toBe("entry-1");
      expect(task.planId).toBe("plan-1");
      expect(task.planTopicId).toBeNull();
      expect(task.taskDate).toBe("2025-07-15");
      expect(task.taskType).toBe("uworld_questions");
      expect(task.provider).toBeNull();
      expect(task.estimatedMinutes).toBe(60);
      expect(task.actualMinutes).toBe(60);
      expect(task.targetCount).toBe(40);
      expect(task.completedCount).toBe(40);
      expect(task.completionPercentage).toBe(100);
      expect(task.incorrectCount).toBe(0);
      expect(task.completedAt).toBeNull();
      expect(task.completedOn).toBe("2025-07-15");
      expect(task.mode).toBe("tutor");
      expect(task.questionPool).toBeNull();
      expect(task.status).toBe("completed");
      expect(task.unlockCondition).toBeNull();
      expect(task.displayOrder).toBe(1);
      expect(task.metadataJson).toEqual({ description: "UWorld Block 1" });
    });

    it("normalizes in_progress entry correctly", () => {
      const result = normalizePlanResponse(v1Response);
      const task = result.tasks[1];
      expect(task.taskType).toBe("flashcard_review");
      expect(task.actualMinutes).toBeNull();
      expect(task.completedCount).toBe(0);
      expect(task.completionPercentage).toBe(0);
      expect(task.completedOn).toBeNull();
      expect(task.status).toBe("in_progress");
    });

    it("normalizes pending entry correctly", () => {
      const result = normalizePlanResponse(v1Response);
      const task = result.tasks[2];
      expect(task.taskType).toBe("learning");
      expect(task.status).toBe("pending");
      expect(task.targetCount).toBeNull();
    });

    it("preserves progress and availability", () => {
      const result = normalizePlanResponse(v1Response);
      expect(result.progress).toEqual(v1Response.progress);
      expect(result.availability).toEqual(v1Response.availability);
    });

    it("handles missing schedule/progress/availability gracefully", () => {
      const result = normalizePlanResponse({ plan: { id: "p1" } });
      expect(result.tasks).toEqual([]);
      expect(result.schedule).toEqual([]);
      expect(result.progress).toEqual([]);
      expect(result.availability).toEqual([]);
    });
  });

  describe("V2 plan", () => {
    const v2Tasks = [
      { id: "t1", taskType: "uworld_questions", status: "completed" },
      { id: "t2", taskType: "flashcard_review", status: "pending" },
    ];

    const v2Response = {
      plan: { id: "plan-2", version: 2 },
      tasks: v2Tasks,
      progress: [{ topicId: "t1", percentage: 75 }],
      availability: [{ date: "2025-07-15", available: false }],
    };

    it("detects version 2 via version field", () => {
      const result = normalizePlanResponse(v2Response);
      expect(result.version).toBe(2);
      expect(result.key).toBe("plan-2");
    });

    it("returns tasks as-is from response", () => {
      const result = normalizePlanResponse(v2Response);
      expect(result.tasks).toBe(v2Tasks);
    });

    it("returns empty schedule for V2", () => {
      const result = normalizePlanResponse(v2Response);
      expect(result.schedule).toEqual([]);
    });

    it("preserves progress and availability", () => {
      const result = normalizePlanResponse(v2Response);
      expect(result.progress).toEqual(v2Response.progress);
      expect(result.availability).toEqual(v2Response.availability);
    });

    it("detects version 2 via tasks array even without version field", () => {
      const response = { plan: { id: "p" }, tasks: [] };
      const result = normalizePlanResponse(response);
      expect(result.version).toBe(2);
    });

    it("handles missing tasks array", () => {
      const result = normalizePlanResponse({ plan: { id: "p", version: 2 } });
      expect(result.tasks).toEqual([]);
    });
  });
});
