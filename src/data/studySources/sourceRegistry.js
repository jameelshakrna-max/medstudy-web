import { STEP_UP_MEDICINE_6E } from "./textbooks/stepUpMedicine6e.js";
import { AMBOSS } from "./textbooks/amboss.js";
import { EL_HUSSEINY_INTERNAL_MEDICINE } from "./textbooks/elhusseinyInternalMedicine.js";
import { EL_HUSSEINY_SURGERY } from "./textbooks/elhusseinySurgery.js";
import { SURGERY_CASE_BASED } from "./textbooks/surgeryCaseBased.js";

export const ALL_SOURCES = [
  STEP_UP_MEDICINE_6E,
  AMBOSS,
  EL_HUSSEINY_INTERNAL_MEDICINE,
  EL_HUSSEINY_SURGERY,
  SURGERY_CASE_BASED,
];

export function getSource(sourceId) {
  return ALL_SOURCES.find(s => s.source.id === sourceId) || null;
}

export function getSourceOptions() {
  return ALL_SOURCES.map(s => ({
    id: s.source.id,
    title: s.source.title,
    edition: s.source.edition,
    type: s.source.type
  }));
}

export function getRotationsForSource(sourceId) {
  const source = getSource(sourceId);
  if (!source) return [];
  return source.rotationSummary.map(r => ({
    rotation: r.rotation,
    topics: r.topics,
    words: r.words
  }));
}

export function getTopicsForRotation(sourceId, rotation) {
  const source = getSource(sourceId);
  if (!source) return [];
  return source.topics.filter(t => t.rotation === rotation && t.heading_kind === 'topic');
}
