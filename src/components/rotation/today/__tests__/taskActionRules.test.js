import { describe, it, expect } from "vitest";
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  getAvailableTaskActions,
  getCompletionFields,
  getPartialFields,
  getTaskProgressRatio,
  calculatePlannerTime,
} from "../taskActionRules";

describe("TASK_TYPE_LABELS", () => {
  it("maps all task types to human-readable labels", () => {
    expect(TASK_TYPE_LABELS.learning).toBe("Learning");
    expect(TASK_TYPE_LABELS.consolidation).toBe("Consolidation");
    expect(TASK_TYPE_LABELS.uworld_questions).toBe("UWorld Questions");
    expect(TASK_TYPE_LABELS.incorrect_review).toBe("Incorrect Review");
    expect(TASK_TYPE_LABELS.mixed_review).toBe("Mixed Review");
    expect(TASK_TYPE_LABELS.optional_book_questions).toBe("Optional Book Questions");
    expect(TASK_TYPE_LABELS.flashcard_review).toBe("Flashcard Review");
  });

  it("has exactly 7 entries", () => {
    expect(Object.keys(TASK_TYPE_LABELS)).toHaveLength(7);
  });
});

describe("TASK_TYPE_ICONS", () => {
  it("maps all task types to Lucide icon names", () => {
    expect(TASK_TYPE_ICONS.learning).toBe("BookOpen");
    expect(TASK_TYPE_ICONS.consolidation).toBe("Brain");
    expect(TASK_TYPE_ICONS.uworld_questions).toBe("FileQuestion");
    expect(TASK_TYPE_ICONS.incorrect_review).toBe("RotateCcw");
    expect(TASK_TYPE_ICONS.mixed_review).toBe("Layers");
    expect(TASK_TYPE_ICONS.optional_book_questions).toBe("Bookmark");
    expect(TASK_TYPE_ICONS.flashcard_review).toBe("GraduationCap");
  });

  it("has exactly 7 entries", () => {
    expect(Object.keys(TASK_TYPE_ICONS)).toHaveLength(7);
  });

  it("has same keys as TASK_TYPE_LABELS", () => {
    expect(Object.keys(TASK_TYPE_ICONS).sort()).toEqual(
      Object.keys(TASK_TYPE_LABELS).sort()
    );
  });
});

describe("getAvailableTaskActions", () => {
  it("returns empty for locked", () => {
    expect(getAvailableTaskActions({ status: "locked", taskType: "learning" })).toEqual([]);
  });

  it("returns start/complete/partial/skip for pending", () => {
    expect(getAvailableTaskActions({ status: "pending", taskType: "learning" })).toEqual([
      "start",
      "complete",
      "partial",
      "skip",
    ]);
  });

  it("returns complete/partial/record_time/record_questions for in_progress", () => {
    expect(
      getAvailableTaskActions({ status: "in_progress", taskType: "uworld_questions" })
    ).toEqual(["complete", "partial", "record_time", "record_questions"]);
  });

  it("returns empty for partial (terminal)", () => {
    expect(getAvailableTaskActions({ status: "partial", taskType: "learning" })).toEqual([]);
  });

  it("returns empty for completed (terminal)", () => {
    expect(getAvailableTaskActions({ status: "completed", taskType: "learning" })).toEqual([]);
  });

  it("returns empty for skipped (terminal)", () => {
    expect(getAvailableTaskActions({ status: "skipped", taskType: "learning" })).toEqual([]);
  });

  it("returns empty for unknown status", () => {
    expect(getAvailableTaskActions({ status: "bogus", taskType: "learning" })).toEqual([]);
  });

  it("does not use taskType in its logic", () => {
    const a = getAvailableTaskActions({ status: "pending", taskType: "uworld_questions" });
    const b = getAvailableTaskActions({ status: "pending", taskType: "flashcard_review" });
    expect(a).toEqual(b);
  });
});

describe("getCompletionFields", () => {
  it("uworld_questions requires completedCount and incorrectCount", () => {
    const fields = getCompletionFields("uworld_questions");
    expect(fields.completedCount).toBe("required");
    expect(fields.incorrectCount).toBe("required");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("incorrect_review requires completedCount", () => {
    const fields = getCompletionFields("incorrect_review");
    expect(fields.completedCount).toBe("required");
    expect(fields.incorrectCount).toBeUndefined();
    expect(fields.actualMinutes).toBe("optional");
  });

  it("learning only requires actualMinutes", () => {
    const fields = getCompletionFields("learning");
    expect(fields).toEqual({ actualMinutes: "optional" });
  });

  it("consolidation only requires actualMinutes", () => {
    const fields = getCompletionFields("consolidation");
    expect(fields).toEqual({ actualMinutes: "optional" });
  });

  it("mixed_review only requires actualMinutes", () => {
    const fields = getCompletionFields("mixed_review");
    expect(fields).toEqual({ actualMinutes: "optional" });
  });

  it("optional_book_questions only requires actualMinutes", () => {
    const fields = getCompletionFields("optional_book_questions");
    expect(fields).toEqual({ actualMinutes: "optional" });
  });

  it("flashcard_review only requires actualMinutes", () => {
    const fields = getCompletionFields("flashcard_review");
    expect(fields).toEqual({ actualMinutes: "optional" });
  });

  it("returns empty object for unknown type", () => {
    expect(getCompletionFields("unknown_type")).toEqual({});
  });
});

describe("getPartialFields", () => {
  it("learning requires completedPercentage and actualMinutes", () => {
    const fields = getPartialFields("learning");
    expect(fields.completedPercentage).toBe("required (1-99)");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("consolidation requires completedPercentage and actualMinutes", () => {
    const fields = getPartialFields("consolidation");
    expect(fields.completedPercentage).toBe("required (1-99)");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("uworld_questions requires completedCount and incorrectCount", () => {
    const fields = getPartialFields("uworld_questions");
    expect(fields.completedCount).toBe("required");
    expect(fields.incorrectCount).toBe("required");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("incorrect_review requires completedCount", () => {
    const fields = getPartialFields("incorrect_review");
    expect(fields.completedCount).toBe("required");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("mixed_review is conditional on targetCount", () => {
    const fields = getPartialFields("mixed_review");
    expect(fields.completedCount).toBe("conditional (if targetCount exists)");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("optional_book_questions is conditional on targetCount", () => {
    const fields = getPartialFields("optional_book_questions");
    expect(fields.completedCount).toBe("conditional (if targetCount exists)");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("flashcard_review is conditional on targetCount", () => {
    const fields = getPartialFields("flashcard_review");
    expect(fields.completedCount).toBe("conditional (if targetCount exists)");
    expect(fields.actualMinutes).toBe("optional");
  });

  it("returns empty object for unknown type", () => {
    expect(getPartialFields("unknown_type")).toEqual({});
  });
});

describe("getTaskProgressRatio", () => {
  it("returns percentage/100 for percentage-based tasks", () => {
    expect(getTaskProgressRatio({ taskType: "learning", completionPercentage: 50 })).toBe(0.5);
    expect(getTaskProgressRatio({ taskType: "consolidation", completionPercentage: 100 })).toBe(1);
    expect(getTaskProgressRatio({ taskType: "learning", completionPercentage: 0 })).toBe(0);
  });

  it("clamps percentage to 0-1 range", () => {
    expect(getTaskProgressRatio({ taskType: "learning", completionPercentage: 150 })).toBe(1);
    expect(getTaskProgressRatio({ taskType: "learning", completionPercentage: -10 })).toBe(0);
  });

  it("defaults to 0 when completionPercentage is missing for percentage tasks", () => {
    expect(getTaskProgressRatio({ taskType: "learning" })).toBe(0);
  });

  it("returns completedCount/targetCount for count-based tasks", () => {
    expect(
      getTaskProgressRatio({
        taskType: "uworld_questions",
        completedCount: 15,
        targetCount: 20,
      })
    ).toBe(0.75);
  });

  it("returns 0 when targetCount is 0 (guards division by zero)", () => {
    expect(
      getTaskProgressRatio({
        taskType: "uworld_questions",
        completedCount: 5,
        targetCount: 0,
      })
    ).toBe(0);
  });

  it("returns 0 when targetCount is missing", () => {
    expect(
      getTaskProgressRatio({
        taskType: "incorrect_review",
        completedCount: 5,
      })
    ).toBe(0);
  });

  it("clamps count ratio to 0-1 range", () => {
    expect(
      getTaskProgressRatio({
        taskType: "uworld_questions",
        completedCount: 25,
        targetCount: 20,
      })
    ).toBe(1);
  });

  it("works for optional count tasks (mixed_review, optional_book_questions, flashcard_review)", () => {
    expect(
      getTaskProgressRatio({
        taskType: "mixed_review",
        completedCount: 3,
        targetCount: 10,
      })
    ).toBe(0.3);

    expect(
      getTaskProgressRatio({
        taskType: "optional_book_questions",
        completedCount: 0,
        targetCount: 5,
      })
    ).toBe(0);

    expect(
      getTaskProgressRatio({
        taskType: "flashcard_review",
        completedCount: 4,
        targetCount: 4,
      })
    ).toBe(1);
  });

  it("returns 0 for tasks with no target and non-percentage type", () => {
    expect(getTaskProgressRatio({ taskType: "unknown_type" })).toBe(0);
  });
});

describe("calculatePlannerTime", () => {
  it("returns all zeros for empty task list", () => {
    const result = calculatePlannerTime([]);
    expect(result).toEqual({
      totalEstimatedMinutes: 0,
      totalActualMinutes: 0,
      completedMinutes: 0,
      weightedProgress: 0,
    });
  });

  it("sums estimatedMinutes and actualMinutes correctly", () => {
    const tasks = [
      { taskType: "learning", estimatedMinutes: 30, actualMinutes: 15, completionPercentage: 50 },
      { taskType: "uworld_questions", estimatedMinutes: 60, actualMinutes: 40, completedCount: 10, targetCount: 20 },
    ];
    const result = calculatePlannerTime(tasks);
    expect(result.totalEstimatedMinutes).toBe(90);
    expect(result.totalActualMinutes).toBe(55);
  });

  it("calculates weightedProgress weighted by estimatedMinutes", () => {
    const tasks = [
      { taskType: "learning", estimatedMinutes: 30, actualMinutes: 0, completionPercentage: 100 },
      { taskType: "uworld_questions", estimatedMinutes: 60, actualMinutes: 0, completedCount: 0, targetCount: 20 },
    ];
    const result = calculatePlannerTime(tasks);
    // learning: ratio=1, weighted=1*30=30
    // uworld: ratio=0, weighted=0*60=0
    // completedMinutes=30, progress=30/90=1/3
    expect(result.completedMinutes).toBeCloseTo(30);
    expect(result.weightedProgress).toBeCloseTo(1 / 3);
  });

  it("weightedProgress is 0 when no estimated minutes exist", () => {
    const tasks = [
      { taskType: "learning", estimatedMinutes: 0, completionPercentage: 50 },
    ];
    const result = calculatePlannerTime(tasks);
    expect(result.weightedProgress).toBe(0);
  });

  it("does not use actualMinutes as completed learning work", () => {
    const tasks = [
      {
        taskType: "uworld_questions",
        estimatedMinutes: 60,
        actualMinutes: 200,
        completedCount: 2,
        targetCount: 40,
      },
    ];
    const result = calculatePlannerTime(tasks);
    expect(result.totalActualMinutes).toBe(200);
    expect(result.completedMinutes).toBeCloseTo(60 * (2 / 40)); // 3, not 200
    expect(result.completedMinutes).not.toBe(200);
  });

  it("handles tasks with missing optional fields gracefully", () => {
    const tasks = [
      { taskType: "learning" },
      { taskType: "uworld_questions" },
    ];
    const result = calculatePlannerTime(tasks);
    expect(result.totalEstimatedMinutes).toBe(0);
    expect(result.totalActualMinutes).toBe(0);
    expect(result.completedMinutes).toBe(0);
    expect(result.weightedProgress).toBe(0);
  });

  it("correctly weights multiple tasks at different progress levels", () => {
    const tasks = [
      { taskType: "learning", estimatedMinutes: 100, actualMinutes: 10, completionPercentage: 25 },
      { taskType: "consolidation", estimatedMinutes: 50, actualMinutes: 5, completionPercentage: 100 },
    ];
    const result = calculatePlannerTime(tasks);
    expect(result.totalEstimatedMinutes).toBe(150);
    expect(result.totalActualMinutes).toBe(15);
    // learning: 0.25 * 100 = 25
    // consolidation: 1.0 * 50 = 50
    // completedMinutes = 75, weightedProgress = 75/150 = 0.5
    expect(result.completedMinutes).toBeCloseTo(75);
    expect(result.weightedProgress).toBeCloseTo(0.5);
  });
});
