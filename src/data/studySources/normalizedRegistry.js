import { VALID_ROTATION_IDS } from "./sourceValidator.js";
import { normalizeAllSources, normalizeSource } from "./normalization/index.js";

const VALID_SOURCES = [
  "step-up-medicine-6e-2024",
  "el-husseiny-essentials-step2ck",
  "el-husseiny-essentials-surgery-step2ck",
  "surgery-case-based-clinical-review-2e-2020",
];

let _cache = null;

function _buildCache() {
  if (_cache) return _cache;
  _cache = normalizeAllSources();
  return _cache;
}

function _ensureSource(sourceId) {
  if (!VALID_SOURCES.includes(sourceId)) {
    throw new Error(`Unknown source: ${sourceId}. Valid sources: ${VALID_SOURCES.join(", ")}`);
  }
}

function getNormalizedTopicsForSource(sourceId) {
  _ensureSource(sourceId);
  const cache = _buildCache();
  return Object.freeze(cache[sourceId].map((t) => ({ ...t, learningMinutes: { ...t.learningMinutes }, metadata: { ...t.metadata }, pageRange: t.pageRange ? { ...t.pageRange } : null })));
}

function getNormalizedTopicsForRotation(sourceId, rotationId) {
  _ensureSource(sourceId);
  if (!VALID_ROTATION_IDS.includes(rotationId)) {
    throw new Error(`Unknown canonical rotation: ${rotationId}`);
  }
  const topics = getNormalizedTopicsForSource(sourceId);
  return Object.freeze(topics.filter((t) => t.rotationId === rotationId));
}

function findNormalizedTopic(sourceId, sourceTopicId) {
  _ensureSource(sourceId);
  const topics = getNormalizedTopicsForSource(sourceId);
  return topics.find((t) => t.sourceTopicId === sourceTopicId) ?? null;
}

function getAllNormalizedTopics() {
  const cache = _buildCache();
  return Object.freeze(
    Object.values(cache).flat()
  );
}

function getSupportedSourcesForRotation(rotationId) {
  if (!VALID_ROTATION_IDS.includes(rotationId)) {
    throw new Error(`Unknown canonical rotation: ${rotationId}`);
  }
  const cache = _buildCache();
  return Object.keys(cache).filter((sourceId) =>
    cache[sourceId].some((t) => t.rotationId === rotationId)
  );
}

export {
  getNormalizedTopicsForSource,
  getNormalizedTopicsForRotation,
  findNormalizedTopic,
  getAllNormalizedTopics,
  getSupportedSourcesForRotation,
  VALID_SOURCES,
};
