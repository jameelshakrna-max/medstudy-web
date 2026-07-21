import { normalizeStepUpMedicine } from "./stepUpMedicine6e.js";
import { normalizeEssentials } from "./elHusseinyEssentials.js";
import { normalizeSurgery } from "./elHusseinySurgery.js";
import { normalizeCaseBasedSurgery } from "./caseBasedSurgery2e.js";

function normalizeAllSources() {
  return {
    "step-up-medicine-6e-2024": normalizeStepUpMedicine(),
    "el-husseiny-essentials-step2ck": normalizeEssentials(),
    "el-husseiny-essentials-surgery-step2ck": normalizeSurgery(),
    "surgery-case-based-clinical-review-2e-2020": normalizeCaseBasedSurgery(),
  };
}

function normalizeSource(sourceId) {
  switch (sourceId) {
    case "step-up-medicine-6e-2024":
      return normalizeStepUpMedicine();
    case "el-husseiny-essentials-step2ck":
      return normalizeEssentials();
    case "el-husseiny-essentials-surgery-step2ck":
      return normalizeSurgery();
    case "surgery-case-based-clinical-review-2e-2020":
      return normalizeCaseBasedSurgery();
    default:
      throw new Error(`Unknown source: ${sourceId}`);
  }
}

export {
  normalizeStepUpMedicine,
  normalizeEssentials,
  normalizeSurgery,
  normalizeCaseBasedSurgery,
  normalizeAllSources,
  normalizeSource,
};
