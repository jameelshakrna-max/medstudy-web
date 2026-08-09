const ACTIVITY_TYPE_MAP = {
  study: "learning",
  uworld: "uworld_questions",
  flashcards: "flashcard_review",
  mixed: "mixed_review",
};

const V1_STATUS_MAP = {
  completed: "completed",
  in_progress: "in_progress",
};

export function isV2Plan(plan) {
  if (!plan || typeof plan !== "object") return false;
  return plan.version === 2 || Array.isArray(plan.tasks);
}

export function mapActivityType(activityType) {
  return ACTIVITY_TYPE_MAP[activityType] || "learning";
}

export function mapV1Status(status) {
  return V1_STATUS_MAP[status] || "pending";
}

export function normalizeLinkedDecks(linkedDecks) {
  if (!Array.isArray(linkedDecks)) return [];
  return linkedDecks.map((deck) => ({
    deckName: deck?.deckName ?? deck?.deck_name ?? null,
    isPrimary: !!deck?.isPrimary ?? !!deck?.is_primary,
    cardCount: deck?.cardCount ?? deck?.card_count ?? 0,
    dueCount: deck?.dueCount ?? deck?.due_count ?? 0,
    openUrl: deck?.openUrl ?? deck?.open_url ?? null,
  }));
}

export function normalizeAvailability(availability) {
  if (!Array.isArray(availability)) return [];
  return availability.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    if (entry.isDayOff == null && entry.is_day_off == null) return entry;
    return { ...entry, isDayOff: !!(entry.isDayOff ?? entry.is_day_off) };
  });
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== "object") return plan;
  return { ...plan, linkedDecks: normalizeLinkedDecks(plan.linkedDecks) };
}

export function normalizePlanResponse(response) {
  if (!response || typeof response !== "object") {
    return {
      key: "",
      version: 1,
      plan: null,
      tasks: [],
      schedule: [],
      progress: [],
      availability: [],
      questionGroups: [],
      questionGroupStates: [],
    };
  }

  const plan = response.plan || response;
  const version = isV2Plan(plan) || Array.isArray(response.tasks) ? 2 : 1;

  if (version === 2) {
    const tasks = Array.isArray(response.tasks) ? response.tasks : [];
    const topics = Array.isArray(response.topics) ? response.topics : [];
    return {
      key: plan.id,
      version: 2,
      plan: normalizePlan(plan),
      tasks,
      topics,
      schedule: [],
      progress: Array.isArray(response.progress) ? response.progress : [],
      availability: normalizeAvailability(response.availability),
      sourcePace: response.sourcePace || null,
      questionGroups: Array.isArray(response.questionGroups) ? response.questionGroups : [],
      questionGroupStates: Array.isArray(response.questionGroupStates) ? response.questionGroupStates : [],
    };
  }

  const schedule = Array.isArray(response.schedule) ? response.schedule : [];
  const tasks = schedule.map((entry) => ({
    id: entry.id,
    planId: plan.id,
    planTopicId: null,
    taskDate: entry.date,
    taskType: mapActivityType(entry.activity_type),
    provider: null,
    estimatedMinutes: entry.estimated_minutes,
    actualMinutes: entry.status === "completed" ? entry.estimated_minutes : null,
    targetCount: entry.uworld_questions || null,
    completedCount: entry.status === "completed" ? (entry.uworld_questions || 0) : 0,
    completionPercentage: entry.status === "completed" ? 100 : 0,
    incorrectCount: 0,
    completedAt: null,
    completedOn: entry.status === "completed" ? entry.date : null,
    mode: entry.uworld_mode,
    questionPool: null,
    status: mapV1Status(entry.status),
    unlockCondition: null,
    displayOrder: entry.sort_order,
    metadataJson: { description: entry.description },
  }));

  return {
    key: plan.id,
    version: 1,
    plan: normalizePlan(plan),
    tasks,
    schedule,
    progress: Array.isArray(response.progress) ? response.progress : [],
    availability: normalizeAvailability(response.availability),
    questionGroups: [],
    questionGroupStates: [],
  };
}

export default {
  isV2Plan,
  mapActivityType,
  mapV1Status,
  normalizePlanResponse,
};
