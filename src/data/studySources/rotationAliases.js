const STEP_UP_ALIASES = {
  "Cardiology": "cardiology",
  "Pulmonology": "pulmonology",
  "Gastroenterology": "gastroenterology",
  "Endocrinology": "endocrinology",
  "Neurology": "neurology",
  "Rheumatology": "rheumatology",
  "Nephrology": "nephrology",
  "Fluids, Electrolytes & Acid-Base": "fluids-electrolytes-acid-base",
  "Hematology & Oncology": "hematology-oncology",
  "Infectious Disease": "infectious-disease",
  "Dermatology & Hypersensitivity": "dermatology-hypersensitivity",
  "Ambulatory Medicine": "ambulatory-medicine",
};

const ESSENTIALS_ALIASES = {
  "Antimicrobials": "antimicrobials",
  "Cardiology": "cardiology",
  "Pulmonology": "pulmonology",
  "Endocrinology": "endocrinology",
  "Nephrology": "nephrology",
  "Gastroenterology": "gastroenterology",
  "Rheumatology": "rheumatology",
  "Hematology": "hematology",
  "Neurology": "neurology",
  "Infectious Diseases": "infectious-diseases",
  "Allergy & Immunology": "allergy-and-immunology",
  "Emergency Medicine": "emergency-medicine",
  "Dermatology": "dermatology",
  "ENT": "ent",
  "Ophthalmology": "ophthalmology",
};

const SURGERY_ALIASES = {
  "Trauma": "trauma",
  "Orthopedics and Sports Medicine": "orthopedic-surgery",
  "Shock": "shock",
  "Preoperative and Postoperative Care": "preoperative-postoperative-care",
  "General Surgery - Gastrointestinal": "general-surgery",
  "Vascular Surgery": "vascular-surgery",
  "Urology": "urology",
};

const CASE_BASED_ALIASES = {
  "Acute Care Surgery": "acute-care-surgery",
  "Breast and Skin": "breast-surgery",
  "Cardiothoracic": "cardiothoracic-surgery",
  "Endocrine": "endocrine-surgery",
  "Head and Neck": "head-neck-surgery",
  "Hepatopancreaticobiliary": "hepatopancreaticobiliary",
  "Lower Gastrointestinal": "lower-gastrointestinal",
  "Neurosurgery": "neurosurgery",
  "Orthopedic Surgery": "orthopedic-surgery",
  "Pediatric Surgery": "pediatric-surgery",
  "Surgical Complications": "surgical-complications",
  "Trauma": "trauma",
  "Upper Gastrointestinal": "upper-gastrointestinal",
  "Urology": "urology",
  "Vascular": "vascular",
};

const SOURCE_ALIASES = {
  "step-up-medicine-6e-2024": STEP_UP_ALIASES,
  "el-husseiny-essentials-step2ck": ESSENTIALS_ALIASES,
  "el-husseiny-essentials-surgery-step2ck": SURGERY_ALIASES,
  "surgery-case-based-clinical-review-2e-2020": CASE_BASED_ALIASES,
};

function resolveRotationAlias(sourceId, rawLabel) {
  const aliases = SOURCE_ALIASES[sourceId];
  if (!aliases) return null;
  return aliases[rawLabel] ?? null;
}

export {
  STEP_UP_ALIASES,
  ESSENTIALS_ALIASES,
  SURGERY_ALIASES,
  CASE_BASED_ALIASES,
  SOURCE_ALIASES,
  resolveRotationAlias,
};
