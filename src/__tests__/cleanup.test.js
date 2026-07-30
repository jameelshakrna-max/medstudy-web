import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BASE = 'https://medstudy-api-staging.medstudy.workers.dev';
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
    throw new Error('Invalid API_BASE_URL. Smoke tests may only run against the approved staging API.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('API_BASE_URL protocol must be HTTPS. Smoke tests may only run against the approved staging API.');
  }
  if (parsed.hostname !== APPROVED_STAGING_HOST) {
    throw new Error(`API_BASE_URL hostname "${parsed.hostname}" is not approved. Smoke tests may only run against ${APPROVED_STAGING_HOST}.`);
  }
  let supabaseParsed;
  try {
    supabaseParsed = new URL(supabaseUrl);
  } catch {
    throw new Error('Invalid SUPABASE_URL.');
  }
  if (supabaseParsed.protocol !== 'https:') {
    throw new Error('SUPABASE_URL protocol must be HTTPS.');
  }
}

// ===================================================================
// HELPER: mock fetch infrastructure
// ===================================================================

let fetchMock;

function mockFetch(responses) {
  const calls = [];
  fetchMock = vi.fn((url, options) => {
    const method = (options && options.method) || 'GET';
    const callKey = `${method} ${url}`;
    calls.push({ url, method });
    if (responses[callKey] !== undefined) {
      const r = responses[callKey];
      return Promise.resolve({
        status: r.status || 200,
        json: () => Promise.resolve(r.body || {}),
        text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body || {})),
      });
    }
    // Default: return 200 with empty body matching common patterns
    if (url.includes('/api/rotation-planner/plans')) {
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('[]'),
      });
    }
    if (url.includes('/api/deck-mappings')) {
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ mappings: [] }),
        text: () => Promise.resolve('{"mappings":[]}'),
      });
    }
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });
  });
  fetchMock.calls = calls;
  return fetchMock;
}

// ===================================================================
// FUNCTIONS UNDER TEST (copied from smoke-test-api.js for testability)
// ===================================================================

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
    body: JSON.stringify({ clientRequestId: 'test-uuid' }),
  });
  if (res.status !== 200 && res.status !== 404) {
    console.error(`  [WARN] deleteMapping ${mappingId}: ${res.status}`);
  }
}

async function listPlans(token) {
  const res = await fetch(`${BASE}/api/rotation-planner/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error(`listPlans failed: ${res.status}`);
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

function collectTrackedPlanIds(testPlanIds) {
  const ids = new Set();
  for (const val of Object.values(testPlanIds)) {
    if (val) ids.add(val);
  }
  return ids;
}

// ===================================================================
// TESTS
// ===================================================================

beforeEach(() => {
  vi.stubGlobal('console', { ...console, error: vi.fn(), log: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cleanup — deleteUserPlans', () => {

  it('1. deletes tracked plan IDs', async () => {
    const token = 'tok-A';
    const tracked = new Set(['plan-1', 'plan-2']);
    const fn = mockFetch({
      'DELETE https://medstudy-api-staging.medstudy.workers.dev/api/rotation-planner/plans/plan-1': { status: 200 },
      'DELETE https://medstudy-api-staging.medstudy.workers.dev/api/rotation-planner/plans/plan-2': { status: 200 },
    });
    vi.stubGlobal('fetch', fn);

    const remaining = await deleteUserPlans(token, tracked);
    expect(remaining).toBe(0);
    const deleteCalls = fn.calls.filter(c => c.method === 'DELETE');
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('2. finds and deletes untracked leftover plan', async () => {
    const token = 'tok-A';
    const emptyTracked = new Set();
    let listCount = 0;
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && url.includes('/rotation-planner/plans')) {
        const plans = listCount === 0
          ? [{ id: 'leftover-plan', usesFlashcardCapacity: 1 }]
          : [];
        listCount++;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve(plans),
          text: () => Promise.resolve(JSON.stringify(plans)),
        });
      }
      if (method === 'DELETE') {
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    const remaining = await deleteUserPlans(token, emptyTracked);
    expect(remaining).toBe(0);
    const deleteCalls = fn.mock.calls.filter(([url, opt]) => opt && opt.method === 'DELETE');
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][0]).toContain('leftover-plan');
  });

  it('3. handles multiple leftover plans', async () => {
    const token = 'tok-A';
    let listCount = 0;
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && url.includes('/rotation-planner/plans')) {
        const plans = listCount === 0
          ? [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
          : [];
        listCount++;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve(plans),
          text: () => Promise.resolve(JSON.stringify(plans)),
        });
      }
      if (method === 'DELETE') {
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    const remaining = await deleteUserPlans(token, new Set());
    expect(remaining).toBe(0);
    const deleteCalls = fn.mock.calls.filter(([url, opt]) => opt && opt.method === 'DELETE');
    expect(deleteCalls.length).toBe(3);
  });

  it('4. treats 404 as already deleted', async () => {
    const token = 'tok-A';
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'DELETE') {
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('Not found') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    await expect(deleteUserPlans(token, new Set(['ghost-plan']))).resolves.not.toThrow();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('5. retries boundedly when plans remain after delete pass', async () => {
    const token = 'tok-A';
    let listCalls = 0;
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && url.includes('/rotation-planner/plans')) {
        listCalls++;
        // Keep returning a plan to force retry
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve([{ id: `stubborn-${listCalls}`, usesFlashcardCapacity: 1 }]),
          text: () => Promise.resolve('[]'),
        });
      }
      if (method === 'DELETE') {
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    const remaining = await deleteUserPlans(token, new Set());
    // After CLEANUP_MAX_PASSES (3) passes + 1 final verification = 4 list calls
    expect(remaining).toBeGreaterThan(0);
    expect(listCalls).toBe(CLEANUP_MAX_PASSES + 1);
  });

});

describe('cleanup — deleteUserMappings', () => {

  it('deletes tracked mapping IDs then falls back to list+delete', async () => {
    const token = 'tok-A';
    const tracked = ['m1', 'm2'];
    let listed = false;
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && url.includes('/deck-mappings')) {
        listed = true;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ mappings: [{ id: 'm3' }] }),
          text: () => Promise.resolve('{"mappings":[{"id":"m3"}]}'),
        });
      }
      if (method === 'DELETE') {
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    await deleteUserMappings(token, tracked);
    const deleteCalls = fn.mock.calls.filter(([url, opt]) => opt && opt.method === 'DELETE');
    expect(deleteCalls.length).toBe(3); // m1, m2, m3
  });

});

describe('cleanup — verifyCleanPlanState', () => {

  it('reports plan and owner counts', async () => {
    const token = 'tok-A';
    const fn = vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve([
          { id: 'p1', usesFlashcardCapacity: 1 },
          { id: 'p2', usesFlashcardCapacity: 0 },
        ]),
        text: () => Promise.resolve('[]'),
      })
    );
    vi.stubGlobal('fetch', fn);

    const state = await verifyCleanPlanState(token);
    expect(state.planCount).toBe(2);
    expect(state.ownerCount).toBe(1);
  });

  it('returns zeros for empty plan list', async () => {
    const token = 'tok-A';
    const fn = vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('[]'),
      })
    );
    vi.stubGlobal('fetch', fn);

    const state = await verifyCleanPlanState(token);
    expect(state.planCount).toBe(0);
    expect(state.ownerCount).toBe(0);
  });

});

describe('cleanup — collectTrackedPlanIds', () => {

  it('collects all non-null IDs from the testPlanIds map', () => {
    const ids = collectTrackedPlanIds({ A: 'plan-a', B: null, A_nonowner: 'plan-a-non' });
    expect(ids.size).toBe(2);
    expect(ids.has('plan-a')).toBe(true);
    expect(ids.has('plan-a-non')).toBe(true);
    expect(ids.has('plan-b')).toBe(false);
  });

  it('returns empty set when all null', () => {
    const ids = collectTrackedPlanIds({ A: null, B: null });
    expect(ids.size).toBe(0);
  });

});

describe('cleanup — runs for both users even if one fails', () => {

  it('6. User A cleanup fails but User B still runs', async () => {
    const tokens = { A: 'tok-A', B: 'tok-B' };
    const users = { A: { id: 'u-a' }, B: { id: 'u-b' } };
    let callCount = 0;

    const fn = vi.fn((url, options) => {
      callCount++;
      // First call (for User A, first listPlans) rejects
      if (callCount === 1) {
        return Promise.reject(new Error('User A API down'));
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    async function cleanupBoth() {
      let hadError = false;
      for (const [key] of Object.entries(users)) {
        const token = tokens[key];
        if (!token) continue;
        try {
          await deleteUserPlans(token, new Set());
          await deleteUserMappings(token, []);
          await verifyCleanPlanState(token);
        } catch {
          hadError = true;
        }
      }
      return hadError;
    }

    const hadError = await cleanupBoth();
    expect(hadError).toBe(true);
    // Both users were attempted (total calls > threshold for one user)
    expect(callCount).toBeGreaterThan(1);
  });

});

describe('cleanup — production hostname isolation', () => {

  it('9. never calls the production hostname', async () => {
    const token = 'tok-A';
    let calledProduction = false;
    const fn = vi.fn((url) => {
      if (url.startsWith(PRODUCTION_BASE)) {
        calledProduction = true;
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    await deleteUserPlans(token, new Set());
    await deleteUserMappings(token, []);
    await verifyCleanPlanState(token);

    expect(calledProduction).toBe(false);
  });

});

describe('cleanup — preserves decks and flashcards', () => {

  it('does not delete cards or decks', async () => {
    const token = 'tok-A';
    let deletedCardOrDeck = false;
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'DELETE' && (url.includes('/api/decks/') || url.includes('/api/flashcards'))) {
        deletedCardOrDeck = true;
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    await deleteUserPlans(token, new Set(['p1']));
    await deleteUserMappings(token, ['m1']);
    await verifyCleanPlanState(token);

    expect(deletedCardOrDeck).toBe(false);
  });

});

describe('cleanup — integration scenario', () => {

  it('7. final verification detects surviving plan', async () => {
    const token = 'tok-A';
    const fn = vi.fn((url, options) => {
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && url.includes('/rotation-planner/plans')) {
        // Always return a zombie — cleanup can never clear it
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve([{ id: 'zombie', usesFlashcardCapacity: 1 }]),
          text: () => Promise.resolve('[{"id":"zombie","usesFlashcardCapacity":1}]'),
        });
      }
      if (method === 'DELETE') {
        // DELETE always "succeeds" but the zombie reappears on next list
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
      }
      return Promise.resolve({ status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
    });
    vi.stubGlobal('fetch', fn);

    const remaining = await deleteUserPlans(token, new Set());
    expect(remaining).toBeGreaterThan(0);

    const state = await verifyCleanPlanState(token);
    expect(state.planCount).toBeGreaterThan(0);
    expect(state.ownerCount).toBeGreaterThan(0);
  });

});

describe('cleanup — production-safety guard', () => {

  const stagingUrl = 'https://medstudy-api-staging.medstudy.workers.dev';
  const validSupabaseUrl = 'https://bzppijzqqfclwtvmiqzb.supabase.co';
  const validSupabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key';

  it('1. approved staging URL succeeds', () => {
    expect(() => guardStagingConfig(stagingUrl, validSupabaseUrl, validSupabaseKey)).not.toThrow();
  });

  it('2. production hostname rejected', () => {
    expect(() => guardStagingConfig('https://medstudy-api.medstudy.workers.dev', validSupabaseUrl, validSupabaseKey))
      .toThrow(/not approved/);
  });

  it('3. lookalike hostname rejected', () => {
    expect(() => guardStagingConfig('https://medstudy-api-staging.medstudy.workers.dev.evil.com', validSupabaseUrl, validSupabaseKey))
      .toThrow(/not approved/);
  });

  it('4. HTTP staging URL rejected', () => {
    expect(() => guardStagingConfig('http://medstudy-api-staging.medstudy.workers.dev', validSupabaseUrl, validSupabaseKey))
      .toThrow(/HTTPS/);
  });

  it('5. missing URL rejected', () => {
    expect(() => guardStagingConfig('', validSupabaseUrl, validSupabaseKey))
      .toThrow(/missing/);
    expect(() => guardStagingConfig(null, validSupabaseUrl, validSupabaseKey))
      .toThrow(/missing/);
    expect(() => guardStagingConfig(undefined, validSupabaseUrl, validSupabaseKey))
      .toThrow(/missing/);
  });

  it('6. no cleanup or API call occurs after rejection', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      guardStagingConfig('https://medstudy-api.medstudy.workers.dev', validSupabaseUrl, validSupabaseKey);
    } catch {
      // expected
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects missing SUPABASE_URL', () => {
    expect(() => guardStagingConfig(stagingUrl, '', validSupabaseKey)).toThrow(/SUPABASE_URL.*missing/);
  });

  it('rejects missing SUPABASE_ANON_KEY', () => {
    expect(() => guardStagingConfig(stagingUrl, validSupabaseUrl, '')).toThrow(/SUPABASE_ANON_KEY.*missing/);
  });

  it('rejects invalid API URL', () => {
    expect(() => guardStagingConfig('not-a-url', validSupabaseUrl, validSupabaseKey)).toThrow(/Invalid API_BASE_URL/);
  });

  it('rejects HTTP SUPABASE_URL', () => {
    expect(() => guardStagingConfig(stagingUrl, 'http://bzppijzqqfclwtvmiqzb.supabase.co', validSupabaseKey)).toThrow(/HTTPS/);
  });

});

describe('cleanup — credential-config validation', () => {

  function validateRequiredEnv(env) {
    const required = ['STAGING_TEST_USER_A_PASSWORD', 'STAGING_TEST_USER_B_PASSWORD'];
    for (const name of required) {
      const v = env[name];
      if (!v || typeof v !== 'string' || v.trim() === '') {
        throw new Error(`Missing required environment variable: ${name}`);
      }
    }
  }

  function requireEnv(env, name, fallback) {
    const v = env[name];
    if (v !== undefined && v !== '') return v;
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }

  const testEnv = {
    STAGING_API_BASE_URL: 'https://medstudy-api-staging.medstudy.workers.dev',
    STAGING_SUPABASE_URL: 'https://bzppijzqqfclwtvmiqzb.supabase.co',
    STAGING_SUPABASE_ANON_KEY: 'test-anon-key',
    STAGING_TEST_USER_A_EMAIL: 'testuser.a@medstudy-staging.test',
    STAGING_TEST_USER_A_PASSWORD: 'valid-pw-a',
    STAGING_TEST_USER_A_ID: 'u-a',
    STAGING_TEST_USER_B_EMAIL: 'testuser.b@medstudy-staging.test',
    STAGING_TEST_USER_B_PASSWORD: 'valid-pw-b',
    STAGING_TEST_USER_B_ID: 'u-b',
  };

  it('1. missing User A password fails closed', () => {
    const env = { ...testEnv, STAGING_TEST_USER_A_PASSWORD: '' };
    expect(() => validateRequiredEnv(env)).toThrow(/Missing required environment variable: STAGING_TEST_USER_A_PASSWORD/);
    expect(() => requireEnv(env, 'STAGING_TEST_USER_A_PASSWORD')).toThrow(/Missing required/);
  });

  it('2. missing User B password fails closed', () => {
    const env = { ...testEnv, STAGING_TEST_USER_B_PASSWORD: undefined };
    expect(() => validateRequiredEnv(env)).toThrow(/STAGING_TEST_USER_B_PASSWORD/);
    expect(() => requireEnv(env, 'STAGING_TEST_USER_B_PASSWORD')).toThrow(/Missing required/);
  });

  it('3. missing Supabase URL fails closed', () => {
    expect(() => requireEnv({}, 'STAGING_SUPABASE_URL')).toThrow(/STAGING_SUPABASE_URL/);
  });

  it('4. missing anon key fails closed', () => {
    expect(() => requireEnv({}, 'STAGING_SUPABASE_ANON_KEY')).toThrow(/STAGING_SUPABASE_ANON_KEY/);
  });

  it('5. missing staging API URL fails closed', () => {
    expect(() => requireEnv({}, 'STAGING_API_BASE_URL')).toThrow(/STAGING_API_BASE_URL/);
  });

  it('6. production host remains rejected by guard', () => {
    expect(() => guardStagingConfig('https://medstudy-api.medstudy.workers.dev', testEnv.STAGING_SUPABASE_URL, testEnv.STAGING_SUPABASE_ANON_KEY))
      .toThrow(/not approved/);
  });

  it('7. no fetch/auth call occurs after config rejection', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      validateRequiredEnv({ STAGING_TEST_USER_A_PASSWORD: '', STAGING_TEST_USER_B_PASSWORD: '' });
    } catch { /* expected */ }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('8. no error output contains password values', () => {
    const env = { STAGING_TEST_USER_A_PASSWORD: '' };
    try {
      validateRequiredEnv(env);
    } catch (e) {
      const msg = e.message;
      expect(msg).toMatch(/STAGING_TEST_USER_A_PASSWORD/);
      expect(msg).not.toContain('valid-pw-a');
    }

    try {
      requireEnv(env, 'STAGING_TEST_USER_A_PASSWORD');
    } catch (e) {
      const msg = e.message;
      expect(msg).toMatch(/STAGING_TEST_USER_A_PASSWORD/);
      expect(msg).not.toContain('valid-pw-a');
    }
  });

});
