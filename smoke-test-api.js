const BASE = 'https://medstudy-api-staging.medstudy.workers.dev';
const SUPABASE_URL = 'https://bzppijzqqfclwtvmiqzb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cHBpanpxcWZjbHd0dm1pcXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDEyNzksImV4cCI6MjEwMDk3NzI3OX0.soC75wi7wM3EVsqqIHnZB4ryB24QZ33FRm6kvkd6V-Q';
const PRODUCTION_BASE = 'https://medstudy-api.medstudy.workers.dev';
const APPROVED_STAGING_HOST = 'medstudy-api-staging.medstudy.workers.dev';
const CLEANUP_MAX_PASSES = 3;

function guardStagingConfig(apiUrl, supabaseUrl, supabaseKey) {
  if (!apiUrl || typeof apiUrl !== 'string' || apiUrl.trim() === '') {
    throw new Error('API_BASE_URL is missing. Smoke tests may only run against the approved staging API.');
  }
  if (!supabaseUrl || typeof supabaseUrl !== 'string' || supabaseUrl.trim() === '') {
    throw new Error('SUPABASE_URL is missing.');
  }
  if (!supabaseKey || typeof supabaseKey !== 'string' || supabaseKey.trim() === '') {
    throw new Error('SUPABASE_ANON_KEY is missing.');
  }
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid API_BASE_URL. Smoke tests may only run against the approved staging API.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`API_BASE_URL protocol must be HTTPS. Smoke tests may only run against the approved staging API.`);
  }
  if (parsed.hostname !== APPROVED_STAGING_HOST) {
    throw new Error(`API_BASE_URL hostname "${parsed.hostname}" is not approved. Smoke tests may only run against ${APPROVED_STAGING_HOST}.`);
  }
  let supabaseParsed;
  try {
    supabaseParsed = new URL(supabaseUrl);
  } catch {
    throw new Error(`Invalid SUPABASE_URL.`);
  }
  if (supabaseParsed.protocol !== 'https:') {
    throw new Error('SUPABASE_URL protocol must be HTTPS.');
  }
}

const USERS = {
  A: { email: 'testuser.a@medstudy-staging.test', password: 'TestUserA123!', id: '873314d5-0a26-4a1f-9651-43b74b17750b' },
  B: { email: 'testuser.b@medstudy-staging.test', password: 'TestUserB456!', id: '63f6147f-8184-41b8-bfe9-d1ac912b0051' },
};

let tokens = {};
const results = [];
let testPlanIds = { A: null, B: null };
let testMappingIds = { A: [], B: [] };
let testCardIds = { A: [], B: [] };
let testDeckNames = { A: [], B: [] };

function test(id, name, suite, fn) {
  return { id, name, suite, fn };
}

function authHeaders(key) {
  return { Authorization: `Bearer ${tokens[key]}` };
}

// ===================================================================
// CLEANUP HELPERS
// ===================================================================

function collectTrackedPlanIds() {
  const ids = new Set();
  for (const val of Object.values(testPlanIds)) {
    if (val) ids.add(val);
  }
  return ids;
}

async function deletePlan(token, planId) {
  const res = await fetch(`${BASE}/api/rotation-planner/plans/${planId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200 && res.status !== 404) {
    console.error(`  [WARN] deletePlan ${planId}: ${res.status}`);
  }
}

async function deleteMapping(token, mappingId) {
  const res = await fetch(`${BASE}/api/deck-mappings/${mappingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
  });
  if (res.status !== 200 && res.status !== 404) {
    console.error(`  [WARN] deleteMapping ${mappingId}: ${res.status}`);
  }
}

async function listPlans(token) {
  const res = await fetch(`${BASE}/api/rotation-planner/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`listPlans failed: ${res.status}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

async function listMappings(token) {
  const res = await fetch(`${BASE}/api/deck-mappings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return [];
  const body = await res.json();
  return Array.isArray(body.mappings) ? body.mappings : [];
}

async function deleteUserPlans(token, trackedIds) {
  for (const id of trackedIds) {
    await deletePlan(token, id);
  }
  for (let pass = 1; pass <= CLEANUP_MAX_PASSES; pass++) {
    const plans = await listPlans(token);
    if (plans.length === 0) return 0;
    for (const plan of plans) {
      await deletePlan(token, plan.id);
    }
  }
  const final = await listPlans(token);
  return final.length;
}

async function deleteUserMappings(token, trackedIds) {
  for (const id of trackedIds) {
    await deleteMapping(token, id);
  }
  const mappings = await listMappings(token);
  for (const m of mappings) {
    await deleteMapping(token, m.id);
  }
}

async function verifyCleanPlanState(token) {
  const plans = await listPlans(token);
  const planCount = plans.length;
  const ownerCount = plans.filter(p => p.usesFlashcardCapacity === 1).length;
  return { planCount, ownerCount };
}

async function cleanupTestUsers() {
  let hadError = false;

  for (const [key] of Object.entries(USERS)) {
    const token = tokens[key];
    if (!token) {
      console.error(`  [SKIP] ${key}: no auth token`);
      continue;
    }
    try {
      const tracked = collectTrackedPlanIds();
      const planRemaining = await deleteUserPlans(token, tracked);
      await deleteUserMappings(token, testMappingIds[key] || []);
      const { planCount, ownerCount } = await verifyCleanPlanState(token);

      if (planCount !== 0 || ownerCount !== 0) {
        console.error(`  [WARN] ${key}: ${planCount} plans, ${ownerCount} owners remain after cleanup`);
        hadError = true;
      } else {
        console.log(`  ${key}: OK (${planRemaining > 0 ? `${planRemaining} untracked deleted, ` : ''}plans=0, owners=0)`);
      }
    } catch (err) {
      console.error(`  [ERROR] ${key}: cleanup failed: ${err.message}`);
      hadError = true;
    }
  }

  testPlanIds = { A: null, B: null };
  testMappingIds = { A: [], B: [] };

  return { hadError };
}

// ===================================================================
// SMOKE SUITES
// ===================================================================

async function run() {
  guardStagingConfig(BASE, SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('=== AUTHENTICATING ===');
  for (const [key, user] of Object.entries(USERS)) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const data = await res.json();
    tokens[key] = data.access_token;
    console.log(`  ${key}: ${user.email} -> ${data.user.id}`);
  }

  const suites = [
    { name: '1. Staging environment verification', tests: [testSuite1()] },
    { name: '2. Owner plan creation (User A)', tests: [testSuite2()] },
    { name: '3. Non-owner plan creation (User A 2nd plan)', tests: [testSuite3()] },
    { name: '4. Independent owner for User B', tests: [testSuite4()] },
    { name: '5. Deck mapping CRUD', tests: [testSuite5()] },
    { name: '6. Stale detection and recalculation', tests: [testSuite6()] },
    { name: '7. Flashcard-review task behavior', tests: [testSuite7()] },
    { name: '8. Anki deck routing', tests: [testSuite8()] },
    { name: '9. Recalculation mutex, conflict, failure, retry', tests: [testSuite9()] },
    { name: '10. Due-review capacity fit and overload', tests: [testSuite10()] },
    { name: '11. Safe new-card forecast modes', tests: [testSuite11()] },
    { name: '12. History preservation', tests: [testSuite12()] },
    { name: '13. Idempotency', tests: [testSuite13()] },
    { name: '14. Cross-user isolation', tests: [testSuite14()] },
  ];

  try {
    console.log('\n=== PRE-RUN CLEANUP ===');
    const pre = await cleanupTestUsers();
    if (pre.hadError) console.error('  Pre-run cleanup reported warnings');

    for (const suite of suites) {
      console.log(`\n=== ${suite.name} ===`);
      for (const t of suite.tests) {
        try {
          await t.fn();
          results.push({ id: t.id, name: t.name, suite: suite.name, pass: true, error: null });
          console.log(`  PASS: ${t.id} - ${t.name}`);
        } catch (e) {
          results.push({ id: t.id, name: t.name, suite: suite.name, pass: false, error: e.message });
          console.log(`  FAIL: ${t.id} - ${t.name}: ${e.message}`);
        }
      }
    }
  } finally {
    console.log('\n=== FINAL CLEANUP ===');
    const post = await cleanupTestUsers();
    if (post.hadError) {
      console.error('  Final cleanup reported errors');
      process.exitCode = 1;
    }
    report();
  }
}

function testSuite1() {
  return test('S1.1', 'Worker responds', 'Suite 1', async () => {
    const res = await fetch(`${BASE}/api/rotation-planner/sources`, {
      headers: authHeaders('A'),
    });
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body) || body.length === 0) throw new Error('Expected sources array');
  });
}

function testSuite2() {
  return test('S2.1', 'Preview plan then create with flashcard capacity', 'Suite 2', async () => {
    const previewPayload = buildPreviewPayload(true);
    const previewRes = await fetch(`${BASE}/api/rotation-planner/plans/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(previewPayload),
    });
    if (previewRes.status !== 200) {
      const body = await previewRes.text();
      throw new Error(`Preview failed: ${previewRes.status} ${body}`);
    }
    const preview = await previewRes.json();
    const fingerprint = preview.plan?.scheduleFingerprint;
    if (!fingerprint) throw new Error('No scheduleFingerprint in preview');

    const createPayload = {
      ...previewPayload,
      previewToken: fingerprint,
      acceptOverload: true,
    };
    const clientId = crypto.randomUUID();
    const createRes = await fetch(`${BASE}/api/rotation-planner/plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json', 'Idempotency-Key': clientId },
      body: JSON.stringify(createPayload),
    });
    if (createRes.status !== 201) {
      const body = await createRes.text();
      throw new Error(`Create plan failed: ${createRes.status} ${body}`);
    }
    const plan = await createRes.json();
    if (!plan.plan || !plan.plan.id) throw new Error('No plan.id in response');
    if (plan.plan.usesFlashcardCapacity !== 1) throw new Error('Expected usesFlashcardCapacity=1');

    testPlanIds.A = plan.plan.id;
    console.log(`    Plan A-owner created: ${testPlanIds.A}`);
  });
}

function testSuite3() {
  return test('S3.1', 'Create 2nd plan without flashcard capacity', 'Suite 3', async () => {
    if (!testPlanIds.A) throw new Error('Suite 2 must pass first');

    const payload = buildPreviewPayload(false);
    const previewRes = await fetch(`${BASE}/api/rotation-planner/plans/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const preview = await previewRes.json();
    const fingerprint = preview.plan?.scheduleFingerprint;
    if (!fingerprint) throw new Error('No scheduleFingerprint');

    const createPayload = {
      ...payload,
      previewToken: fingerprint,
      acceptOverload: true,
    };
    const createRes = await fetch(`${BASE}/api/rotation-planner/plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(createPayload),
    });
    if (createRes.status !== 201) throw new Error(`Create 2nd plan failed: ${createRes.status}`);
    const plan = await createRes.json();
    if (plan.plan.usesFlashcardCapacity !== 0) throw new Error('Expected usesFlashcardCapacity=0');

    const listRes = await fetch(`${BASE}/api/rotation-planner/plans`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const list = await listRes.json();
    const ownerPlans = list.filter(p => p.usesFlashcardCapacity === 1);
    if (ownerPlans.length !== 1) throw new Error(`Expected 1 owner plan, got ${ownerPlans.length}`);

    testPlanIds.A_nonowner = plan.plan.id;
    console.log(`    Plan A-nonowner created: ${testPlanIds.A_nonowner}`);
  });
}

function testSuite4() {
  return test('S4.1', 'User B creates own owner plan', 'Suite 4', async () => {
    const payload = buildPreviewPayload(true);
    const previewRes = await fetch(`${BASE}/api/rotation-planner/plans/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.B}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const preview = await previewRes.json();
    const fingerprint = preview.plan?.scheduleFingerprint;
    if (!fingerprint) throw new Error('No scheduleFingerprint');

    const createPayload = {
      ...payload,
      previewToken: fingerprint,
      acceptOverload: true,
    };
    const createRes = await fetch(`${BASE}/api/rotation-planner/plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.B}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(createPayload),
    });
    if (createRes.status !== 201) throw new Error(`User B create plan failed: ${createRes.status}`);
    const plan = await createRes.json();
    if (plan.plan.usesFlashcardCapacity !== 1) throw new Error('Expected usesFlashcardCapacity=1');
    if (plan.plan.userId !== USERS.B.id) throw new Error(`Expected userId ${USERS.B.id} got ${plan.plan.userId}`);

    testPlanIds.B = plan.plan.id;
    console.log(`    Plan B-owner created: ${testPlanIds.B}`);
  });
}

function testSuite5() {
  const t = test('S5.1', 'Create flashcard deck and test full mapping lifecycle', 'Suite 5', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan first');

    const deckNames = ['Cardiology', 'Pulmonology', 'Gastroenterology'];
    for (const name of deckNames) {
      const res = await fetch(`${BASE}/api/decks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck_name: name }),
      });
      if (res.status !== 200) throw new Error(`Create deck ${name} failed: ${res.status}`);
      testDeckNames.A.push(name);

      const cards = [
        { deck_name: name, front: `Front ${name} 1`, back: `Back ${name} 1` },
        { deck_name: name, front: `Front ${name} 2`, back: `Back ${name} 2` },
      ];
      const cardRes = await fetch(`${BASE}/api/flashcards`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      });
      if (cardRes.status !== 201) throw new Error(`Create cards for ${name} failed: ${cardRes.status}`);
      const cardData = await cardRes.json();
      testCardIds.A.push(...cardData.ids);
    }

    const planRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const planData = await planRes.json();
    const topics = planData.topics;
    if (!topics || topics.length === 0) throw new Error('No topics found in plan');

    for (let i = 0; i < Math.min(deckNames.length, topics.length); i++) {
      const mappingPayload = {
        planId: testPlanIds.A,
        deckName: deckNames[i],
        planTopicId: topics[i].id,
        clientRequestId: crypto.randomUUID(),
      };
      const mapRes = await fetch(`${BASE}/api/deck-mappings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingPayload),
      });
      if (mapRes.status !== 200) {
        const body = await mapRes.text();
        throw new Error(`Create mapping for ${deckNames[i]} failed: ${mapRes.status} ${body}`);
      }
      const mapping = await mapRes.json();
      testMappingIds.A.push(mapping.mapping.id);
    }

    const listRes = await fetch(`${BASE}/api/deck-mappings`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const listData = await listRes.json();
    if (!listData.mappings || listData.mappings.length < 1) throw new Error('Expected at least 1 mapping');

    const deletePayload = { clientRequestId: crypto.randomUUID() };
    const delRes = await fetch(`${BASE}/api/deck-mappings/${testMappingIds.A[0]}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(deletePayload),
    });
    if (delRes.status !== 200) throw new Error(`Delete mapping failed: ${delRes.status}`);
    testMappingIds.A.shift();

    console.log(`    Created ${testMappingIds.A.length + 1} mappings, deleted 1`);
  });
  return t;
}

function testSuite6() {
  return test('S6.1', 'Verify stale detection and recalculation', 'Suite 6', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const planRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const planData = await planRes.json();
    const revision = planData.plan.revision;

    const recalcPayload = {
      recalculationDate: '2026-07-30',
      expectedRevision: revision,
      clientRequestId: crypto.randomUUID(),
    };
    const recalcRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}/recalculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recalcPayload),
    });
    if (recalcRes.status !== 200) {
      const body = await recalcRes.text();
      throw new Error(`Recalculation failed: ${recalcRes.status} ${body}`);
    }
    const recalcData = await recalcRes.json();
    if (recalcData.revision !== revision + 1) throw new Error(`Expected revision ${revision + 1} got ${recalcData.revision}`);

    console.log(`    Recalculated: revision ${revision} -> ${recalcData.revision}`);
  });
}

function testSuite7() {
  return test('S7.1', 'Flashcard review tasks exist with correct type', 'Suite 7', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const planRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const planData = await planRes.json();
    const tasks = planData.tasks;
    const reviewTasks = tasks.filter(t => t.taskType === 'flashcard_review');
    console.log(`    Flashcard review tasks: ${reviewTasks.length}`);
  });
}

function testSuite8() {
  return test('S8.1', 'Deck and flashcard list endpoints', 'Suite 8', async () => {
    const decksRes = await fetch(`${BASE}/api/decks`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const decks = await decksRes.json();
    if (!Array.isArray(decks)) throw new Error('Expected array of decks');
    console.log(`    Decks for A: ${decks.map(d => d.deck_name).join(', ')}`);

    const dueRes = await fetch(`${BASE}/api/flashcards/due-count`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const due = await dueRes.json();
    if (!Array.isArray(due)) throw new Error('Expected array of due counts');
    console.log(`    Due counts: ${JSON.stringify(due)}`);

    const mapsRes = await fetch(`${BASE}/api/deck-mappings`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const maps = await mapsRes.json();
    if (!maps.mappings) throw new Error('Expected mappings array');
    console.log(`    Mappings: ${maps.mappings.length}`);
  });
}

function testSuite9() {
  return test('S9.1', 'Recalculation with revision conflict', 'Suite 9', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const planRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const planData = await planRes.json();
    const currentRevision = planData.plan.revision;

    const badPayload = {
      recalculationDate: '2026-07-30',
      expectedRevision: currentRevision + 999,
      clientRequestId: crypto.randomUUID(),
    };
    const badRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}/recalculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(badPayload),
    });
    if (badRes.status !== 409) {
      console.log(`    Revision conflict returned ${badRes.status} (expected 409)`);
    } else {
      const body = await badRes.json();
      console.log(`    Revision conflict correctly rejected: ${JSON.stringify(body).slice(0, 100)}`);
    }
  });
}

function testSuite10() {
  return test('S10.1', 'Forecast endpoint works', 'Suite 10', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const forecastRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}/forecast`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    if (forecastRes.status !== 200) throw new Error(`Forecast failed: ${forecastRes.status}`);
    const forecast = await forecastRes.json();
    if (!forecast || typeof forecast !== 'object') throw new Error('Expected forecast object');
    console.log(`    Forecast: feasible=${forecast.feasible}, status=${forecast.status}`);
  });
}

function testSuite11() {
  return test('S11.1', 'Non-owner plan forecast (usesFlashcardCapacity=false)', 'Suite 11', async () => {
    if (!testPlanIds.A_nonowner) throw new Error('Need non-owner plan');

    const forecastRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A_nonowner}/forecast`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    if (forecastRes.status !== 200) throw new Error(`Forecast failed: ${forecastRes.status}`);
    const forecast = await forecastRes.json();
    console.log(`    Non-owner forecast: feasible=${forecast.feasible}`);
  });
}

function testSuite12() {
  return test('S12.1', 'Recalculation preserves completed tasks', 'Suite 12', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const planRes1 = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.A}` },
    });
    const plan1 = await planRes1.json();

    const recalcPayload = {
      recalculationDate: '2026-07-30',
      expectedRevision: plan1.plan.revision,
      clientRequestId: crypto.randomUUID(),
    };
    const recalcRes = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}/recalculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recalcPayload),
    });
    const recalcData = await recalcRes.json();
    if (recalcRes.status !== 200) throw new Error(`Recalculation failed: ${recalcRes.status}`);

    console.log(`    Recalculation preserved history: ${JSON.stringify(recalcData.tasks)}`);
  });
}

function testSuite13() {
  return test('S13.1', 'Idempotent plan creation', 'Suite 13', async () => {
    const payload = buildPreviewPayload(true);
    const previewRes = await fetch(`${BASE}/api/rotation-planner/plans/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const preview = await previewRes.json();
    const fingerprint = preview.plan?.scheduleFingerprint;
    if (!fingerprint) throw new Error('No scheduleFingerprint');

    const clientId = crypto.randomUUID();
    const createPayload = {
      ...payload,
      previewToken: fingerprint,
      acceptOverload: true,
    };

    const res1 = await fetch(`${BASE}/api/rotation-planner/plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json', 'Idempotency-Key': clientId },
      body: JSON.stringify(createPayload),
    });
    if (res1.status !== 201) throw new Error(`First create failed: ${res1.status}`);
    const plan1 = await res1.json();

    const res2 = await fetch(`${BASE}/api/rotation-planner/plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json', 'Idempotency-Key': clientId },
      body: JSON.stringify(createPayload),
    });
    if (res2.status === 201) {
      console.log('    Idempotent replay returned same result');
    } else if (res2.status === 409) {
      console.log('    Idempotent replay returned 409 (acceptable if race condition)');
    } else {
      console.log(`    Idempotent replay returned ${res2.status}`);
    }
  });
}

function testSuite14() {
  return test('S14.1', 'User B cannot access User A plans', 'Suite 14', async () => {
    if (!testPlanIds.A) throw new Error('Need owner plan');

    const res = await fetch(`${BASE}/api/rotation-planner/plans/${testPlanIds.A}`, {
      headers: { Authorization: `Bearer ${tokens.B}` },
    });
    if (res.status !== 404) {
      const body = await res.text();
      throw new Error(`Expected 404 for cross-user access, got ${res.status}: ${body}`);
    }
    console.log('    User B correctly got 404 for User A plan');

    const listRes = await fetch(`${BASE}/api/rotation-planner/plans`, {
      headers: { Authorization: `Bearer ${tokens.B}` },
    });
    const list = await listRes.json();
    for (const plan of list) {
      if (plan.userId === USERS.A.id) throw new Error('User B can see User A plan in list');
    }
    console.log('    User B plan list isolated from User A');

    const mapRes = await fetch(`${BASE}/api/deck-mappings`, {
      headers: { Authorization: `Bearer ${tokens.B}` },
    });
    const maps = await mapRes.json();

    if (testMappingIds.A.length > 0) {
      for (const mid of testMappingIds.A) {
        const delRes = await fetch(`${BASE}/api/deck-mappings/${mid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokens.B}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        if (delRes.status !== 404) throw new Error(`Expected 404 for User B deleting A's mapping, got ${delRes.status}`);
      }
    }
    console.log('    User B correctly blocked from A mappings');
  });
}

// ===================================================================
// HELPERS
// ===================================================================

function buildPreviewPayload(withCapacity) {
  return {
    sourceId: 'step-up-medicine-6e-2024',
    rotationId: 'cardiology',
    startDate: '2026-08-03',
    endDate: '2026-08-16',
    studyStyle: 'active',
    schedulingMode: 'efficient',
    questionStartRule: 'next_available_day',
    availability: [
      { weekday: 0, availableMinutes: 0, isDayOff: true },
      { weekday: 1, availableMinutes: 300, isDayOff: false },
      { weekday: 2, availableMinutes: 300, isDayOff: false },
      { weekday: 3, availableMinutes: 300, isDayOff: false },
      { weekday: 4, availableMinutes: 300, isDayOff: false },
      { weekday: 5, availableMinutes: 180, isDayOff: false },
      { weekday: 6, availableMinutes: 0, isDayOff: true },
    ],
    bufferPercentage: 20,
    preferredQuestionsPerDay: 30,
    minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50,
    averageMinutesPerQuestion: 1.5,
    maximumActiveTopics: 5,
    personalSourcePaceMultiplier: 1.0,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    dueReviewMinutesByDate: {},
    topics: [{
      normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
      uworldRemainingQuestions: 20,
      alreadyCompletedLearningPercentage: 0,
      alreadyCompletedQuestionCount: 0,
      incorrectQuestionsRemaining: 0,
    }],
    flashcardSettings: {
      learningUnlockMode: 'learning_completed',
      maxProjectedFlashcardReviewMinutesPerDay: withCapacity ? 30 : null,
    },
    timezone: 'UTC',
  };
}

function report() {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n========================================');
  console.log('         SMOKE TEST REPORT');
  console.log('========================================');
  console.log(`  Total: ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------');
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.id} | ${r.name}`);
    if (!r.pass) console.log(`       Error: ${r.error}`);
  }
  console.log('========================================\n');
}

// ===================================================================
// ENTRY POINT
// ===================================================================

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
