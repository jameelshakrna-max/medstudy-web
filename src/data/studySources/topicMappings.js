// Maps rotation names from source catalogs to study_subjects.id values
export const ROTATION_TO_SUBJECT = {
  "Cardiology": "cardiology",
  "Pulmonology": "respiratory",
  "Gastroenterology": "gastroenterology",
  "Endocrinology": "endocrinology",
  "Neurology": "neurology",
  "Rheumatology": "rheumatology",
  "Nephrology": "nephrology",
  "Fluids, Electrolytes & Acid-Base": "nephrology", // maps to closest subject
  "Hematology & Oncology": "hematology", // primary mapping
  "Infectious Disease": "infectious",
  "Dermatology & Hypersensitivity": "dermatology",
  "Ambulatory Medicine": "other", // no direct match
  "Emergency Medicine": "emergency",
  "Pediatrics": "pediatrics",
  "Psychiatry": "psychiatry",
  "General Surgery": "other",
  "Orthopedics": "other",
  "Urology": "other",
  "Cardiothoracic Surgery": "cardiology", // closest
  "Neurosurgery": "neurology", // closest
  "Plastic Surgery": "other",
  "Vascular Surgery": "cardiology", // closest
};

// Reverse mapping: subject_id -> rotation names
export const SUBJECT_TO_ROTATIONS = {};
for (const [rotation, subject] of Object.entries(ROTATION_TO_SUBJECT)) {
  if (!SUBJECT_TO_ROTATIONS[subject]) SUBJECT_TO_ROTATIONS[subject] = [];
  SUBJECT_TO_ROTATIONS[subject].push(rotation);
}

// All available rotation names across all sources
export const ALL_ROTATIONS = Object.keys(ROTATION_TO_SUBJECT);
