import { VALID_ROTATION_IDS } from "./sourceValidator.js";

const ROTATION_DEFINITIONS = [
  { id: "acute-care-surgery", displayLabel: "Acute Care Surgery", subjectId: null },
  { id: "allergy-and-immunology", displayLabel: "Allergy & Immunology", subjectId: null },
  { id: "ambulatory-medicine", displayLabel: "Ambulatory Medicine", subjectId: "other" },
  { id: "antimicrobials", displayLabel: "Antimicrobials", subjectId: null },
  { id: "breast-surgery", displayLabel: "Breast Surgery", subjectId: null },
  { id: "cardiology", displayLabel: "Cardiology", subjectId: "cardiology" },
  { id: "cardiothoracic-surgery", displayLabel: "Cardiothoracic Surgery", subjectId: "cardiology" },
  { id: "dermatology", displayLabel: "Dermatology", subjectId: null },
  { id: "dermatology-hypersensitivity", displayLabel: "Dermatology & Hypersensitivity", subjectId: "dermatology" },
  { id: "emergency-medicine", displayLabel: "Emergency Medicine", subjectId: "emergency" },
  { id: "endocrine-surgery", displayLabel: "Endocrine Surgery", subjectId: null },
  { id: "endocrinology", displayLabel: "Endocrinology", subjectId: "endocrinology" },
  { id: "ent", displayLabel: "ENT", subjectId: null },
  { id: "fluids-electrolytes-acid-base", displayLabel: "Fluids, Electrolytes & Acid-Base", subjectId: "nephrology" },
  { id: "gastroenterology", displayLabel: "Gastroenterology", subjectId: "gastroenterology" },
  { id: "general-surgery", displayLabel: "General Surgery", subjectId: "other" },
  { id: "head-neck-surgery", displayLabel: "Head & Neck Surgery", subjectId: null },
  { id: "hematology", displayLabel: "Hematology", subjectId: null },
  { id: "hematology-oncology", displayLabel: "Hematology & Oncology", subjectId: "hematology" },
  { id: "hepatopancreaticobiliary", displayLabel: "Hepatopancreaticobiliary", subjectId: null },
  { id: "infectious-disease", displayLabel: "Infectious Disease", subjectId: "infectious" },
  { id: "infectious-diseases", displayLabel: "Infectious Diseases", subjectId: null },
  { id: "lower-gastrointestinal", displayLabel: "Lower Gastrointestinal", subjectId: null },
  { id: "nephrology", displayLabel: "Nephrology", subjectId: "nephrology" },
  { id: "neurology", displayLabel: "Neurology", subjectId: "neurology" },
  { id: "neurosurgery", displayLabel: "Neurosurgery", subjectId: "neurology" },
  { id: "ophthalmology", displayLabel: "Ophthalmology", subjectId: null },
  { id: "orthopedic-surgery", displayLabel: "Orthopedic Surgery", subjectId: "other" },
  { id: "pediatric-surgery", displayLabel: "Pediatric Surgery", subjectId: null },
  { id: "preoperative-postoperative-care", displayLabel: "Preoperative & Postoperative Care", subjectId: null },
  { id: "pulmonology", displayLabel: "Pulmonology", subjectId: "respiratory" },
  { id: "rheumatology", displayLabel: "Rheumatology", subjectId: "rheumatology" },
  { id: "shock", displayLabel: "Shock", subjectId: null },
  { id: "surgical-complications", displayLabel: "Surgical Complications", subjectId: null },
  { id: "trauma", displayLabel: "Trauma", subjectId: null },
  { id: "upper-gastrointestinal", displayLabel: "Upper Gastrointestinal", subjectId: null },
  { id: "urology", displayLabel: "Urology", subjectId: "other" },
  { id: "vascular", displayLabel: "Vascular", subjectId: null },
  { id: "vascular-surgery", displayLabel: "Vascular Surgery", subjectId: "cardiology" },
];

const _rotationById = new Map(ROTATION_DEFINITIONS.map((r) => [r.id, Object.freeze(r)]));

Object.freeze(ROTATION_DEFINITIONS);

function getRotationDefinitions() {
  return ROTATION_DEFINITIONS;
}

function getRotationById(id) {
  return _rotationById.get(id) ?? null;
}

function validateRotationId(id) {
  return VALID_ROTATION_IDS.includes(id);
}

export {
  ROTATION_DEFINITIONS,
  getRotationDefinitions,
  getRotationById,
  validateRotationId,
};
