const SHARED_TOPIC_KEYS = {
  "shared.aaa": {
    canonicalTopicId: "shared.aaa",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "cardiology.abdominal-aortic-aneurysm" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "vascular-surgery.abdominal-aortic-aneurysm" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.abdominal-aortic-aneurysm" },
    ],
  },
  "shared.acute-limb-ischemia": {
    canonicalTopicId: "shared.acute-limb-ischemia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "cardiology.acute-arterial-occlusion" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "vascular-surgery.acute-limb-ischemia" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.acute-limb-ischemia" },
    ],
  },
  "shared.cholelithiasis": {
    canonicalTopicId: "shared.cholelithiasis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.cholelithiasis" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "general-surgery-gastrointestinal.cholelithiasis" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.cholelithiasis-and-biliary-colic" },
    ],
  },
  "shared.cholecystitis": {
    canonicalTopicId: "shared.cholecystitis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.acute-cholecystitis" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "general-surgery-gastrointestinal.acute-cholecystitis" },
    ],
  },
  "shared.acalculous-cholecystitis": {
    canonicalTopicId: "shared.acalculous-cholecystitis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.acalculous-cholecystitis" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "general-surgery-gastrointestinal.acalculous-cholecystitis" },
    ],
  },
  "shared.appendicitis": {
    canonicalTopicId: "shared.appendicitis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.acute-appendicitis" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "general-surgery-gastrointestinal.appendicitis" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.acute-appendicitis" },
    ],
  },
  "shared.sbo": {
    canonicalTopicId: "shared.sbo",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.small-bowel-obstruction" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.small-bowel-obstruction" },
    ],
  },
  "shared.paralytic-ileus": {
    canonicalTopicId: "shared.paralytic-ileus",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.paralytic-ileus" },
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "general-surgery-gastrointestinal.paralytic-ileus" },
    ],
  },
  "shared.hiatal-hernia": {
    canonicalTopicId: "shared.hiatal-hernia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "gastroenterology.esophageal-hiatal-hernias" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "gastroenterology.hiatal-hernia" },
    ],
  },
  "shared.diabetes-mellitus": {
    canonicalTopicId: "shared.diabetes-mellitus",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.diabetes-mellitus" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.diabetes-mellitus" },
    ],
  },
  "shared.dm-chronic-complications": {
    canonicalTopicId: "shared.dm-chronic-complications",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.chronic-complications-of-diabetes-mellitus" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.chronic-complications-of-diabetes" },
    ],
  },
  "shared.dm-acute-complications": {
    canonicalTopicId: "shared.dm-acute-complications",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.acute-complications-of-diabetes-mellitus" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.acute-complications-of-diabetes" },
    ],
  },
  "shared.diabetes-insipidus": {
    canonicalTopicId: "shared.diabetes-insipidus",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.diabetes-insipidus" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.diabetes-insipidus" },
    ],
  },
  "shared.hyperthyroidism": {
    canonicalTopicId: "shared.hyperthyroidism",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.hyperthyroidism" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.hyperthyroidism" },
    ],
  },
  "shared.hypothyroidism": {
    canonicalTopicId: "shared.hypothyroidism",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.hypothyroidism" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.hypothyroidism" },
    ],
  },
  "shared.thyroiditis": {
    canonicalTopicId: "shared.thyroiditis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.thyroiditis" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.thyroiditis" },
    ],
  },
  "shared.thyroid-nodules": {
    canonicalTopicId: "shared.thyroid-nodules",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.thyroid-nodules" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.thyroid-nodules" },
    ],
  },
  "shared.thyroid-cancer": {
    canonicalTopicId: "shared.thyroid-cancer",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "endocrinology.thyroid-cancer" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "endocrinology.thyroid-cancer" },
    ],
  },
  "shared.pneumonia": {
    canonicalTopicId: "shared.pneumonia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "infectious-disease.pneumonia" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "pulmonology.pneumonia" },
    ],
  },
  "shared.cystitis": {
    canonicalTopicId: "shared.cystitis",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "infectious-disease.cystitis-lower-urinary-tract-infections" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "nephrology.cystitis" },
    ],
  },
  "shared.anemia-overview": {
    canonicalTopicId: "shared.anemia-overview",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.basics-of-anemia" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.anemia" },
    ],
  },
  "shared.iron-deficiency-anemia": {
    canonicalTopicId: "shared.iron-deficiency-anemia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.iron-deficiency-anemia" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.iron-deficiency-anemia" },
    ],
  },
  "shared.aplastic-anemia": {
    canonicalTopicId: "shared.aplastic-anemia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.aplastic-anemia" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.aplastic-anemia" },
    ],
  },
  "shared.anemia-chronic-disease": {
    canonicalTopicId: "shared.anemia-chronic-disease",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.anemia-of-chronic-disease" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.anemia-of-chronic-disease" },
    ],
  },
  "shared.sideroblastic-anemia": {
    canonicalTopicId: "shared.sideroblastic-anemia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.sideroblastic-anemia" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.sideroblastic-anemia" },
    ],
  },
  "shared.hemolytic-anemia": {
    canonicalTopicId: "shared.hemolytic-anemia",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "hematology-oncology.hemolytic-anemias-overview" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "hematology.hemolytic-anemia" },
    ],
  },
  "shared.toxic-shock-syndrome": {
    canonicalTopicId: "shared.toxic-shock-syndrome",
    entries: [
      { sourceId: "step-up-medicine-6e-2024", sourceTopicId: "infectious-disease.toxic-shock-syndrome" },
      { sourceId: "el-husseiny-essentials-step2ck", sourceTopicId: "dermatology.toxic-shock-syndrome-tss" },
    ],
  },
  "shared.postop-vte": {
    canonicalTopicId: "shared.postop-vte",
    entries: [
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "preoperative-and-postoperative-care.postoperative-deep-vein-thrombosis" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.postoperative-venous-thromboembolism-and-pulmonary-embolism" },
    ],
  },
  "shared.ortho-trauma-overview": {
    canonicalTopicId: "shared.ortho-trauma-overview",
    entries: [
      { sourceId: "el-husseiny-essentials-surgery-step2ck", sourceTopicId: "orthopedics-and-sports-medicine.orthopedic-assessment-and-fracture-principles" },
      { sourceId: "surgery-case-based-clinical-review-2e-2020", sourceTopicId: "surgery.initial-management-of-orthopedic-trauma-and-fractures" },
    ],
  },
};

const _topicToSharedKey = new Map();

for (const [sharedKey, definition] of Object.entries(SHARED_TOPIC_KEYS)) {
  for (const entry of definition.entries) {
    const compositeKey = `${entry.sourceId}::${entry.sourceTopicId}`;
    _topicToSharedKey.set(compositeKey, sharedKey);
  }
}

Object.freeze(SHARED_TOPIC_KEYS);

function getSharedTopicKey(sourceId, sourceTopicId) {
  return _topicToSharedKey.get(`${sourceId}::${sourceTopicId}`) ?? null;
}

function getSharedTopicDefinition(sharedKey) {
  return SHARED_TOPIC_KEYS[sharedKey] ?? null;
}

export {
  SHARED_TOPIC_KEYS,
  getSharedTopicKey,
  getSharedTopicDefinition,
};
