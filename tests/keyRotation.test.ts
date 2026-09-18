import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The key pool reads its keys from data/user/secrets.json at import time and writes back on
 * every change, so each test installs its own fetch stub before importing the module fresh.
 */
async function loadPool(keys: { id: string; label: string; key: string }[]) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    if (url === '/api/secrets' && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, json: async () => ({ keys, activeKeyId: null }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }));
  const pool = await import('../services/geminiKeyPool');
  // The module's own load() is in flight; let it settle before the first call.
  await new Promise(resolve => setTimeout(resolve, 0));
  return pool;
}

function rateLimit(): Error {
  return new Error('[429] RESOURCE_EXHAUSTED: quota exceeded for this key');
}
function forbidden(): Error {
  return new Error('[403] PERMISSION_DENIED: API key not valid');
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Gemini key rotation', () => {
  it('uses the first working key and does not touch the others', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
    ]);
    const call = vi.fn(async (apiKey: string) => `ok:${apiKey}`);
    expect(await withApiKeyRotation(call)).toBe('ok:key-a');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('moves to the next key when the first is rate-limited', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
    ]);
    const call = vi.fn(async (apiKey: string) => {
      if (apiKey === 'key-a') throw rateLimit();
      return `ok:${apiKey}`;
    });
    expect(await withApiKeyRotation(call)).toBe('ok:key-b');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('skips a key rejected as forbidden and keeps going', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
    ]);
    const call = vi.fn(async (apiKey: string) => {
      if (apiKey === 'key-a') throw forbidden();
      return `ok:${apiKey}`;
    });
    expect(await withApiKeyRotation(call)).toBe('ok:key-b');
  });

  it('fails immediately when every key is forbidden — waiting cannot fix a bad key', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
    ]);
    await expect(withApiKeyRotation(async () => { throw forbidden(); }))
      .rejects.toThrow(/PERMISSION_DENIED|not valid/);
  });

  it('surfaces a non-quota error straight away instead of trying other keys', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
    ]);
    const call = vi.fn(async () => { throw new Error('Scene writer returned an empty page.'); });
    await expect(withApiKeyRotation(call)).rejects.toThrow('Scene writer returned an empty page.');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('waits out a pool-wide rate limit and resumes instead of failing the run', async () => {
    const { withApiKeyRotation, getRateLimitStatus } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
    ]);
    let attempts = 0;
    const call = vi.fn(async (apiKey: string) => {
      attempts += 1;
      if (attempts === 1) throw rateLimit(); // the whole pool is spent on the first pass
      return `ok:${apiKey}`;
    });

    // The wait is as long as the key's own cooldown (minutes), so time is driven by hand here.
    vi.useFakeTimers();
    const pending = withApiKeyRotation(call);
    await vi.advanceTimersByTimeAsync(0);

    // Nothing failed: the wait is announced so the UI can say generation is slowing down.
    expect(getRateLimitStatus().resumeAt).not.toBeNull();
    expect(getRateLimitStatus().attempt).toBe(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(pending).resolves.toBe('ok:key-a');
    expect(attempts).toBe(2);
    // Once a call gets through, the banner goes away again.
    expect(getRateLimitStatus().resumeAt).toBeNull();
  });
});

describe('cooldowns bench one key, not the pool', () => {
  it('reads the rest Google itself asked for', async () => {
    const { retryDelayFromError } = await loadPool([]);
    expect(retryDelayFromError(new Error('{"retryDelay":"127s"}'))).toBe(127_000);
    expect(retryDelayFromError(new Error("retryDelay: '3.5s'"))).toBe(3_500);
    expect(retryDelayFromError(new Error('plain quota message'))).toBeNull();
  });

  it('keeps the fresh keys usable while one rests out its 127 seconds', async () => {
    // The complaint this answers: one key cooled down for 127s and the run stalled
    // although two untouched keys were sitting right behind it.
    const { withApiKeyRotation, getKeyStatuses } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
      { id: 'c', label: 'C', key: 'key-c' },
    ]);
    const call = vi.fn(async (apiKey: string) => {
      if (apiKey === 'key-a') throw new Error('[429] RESOURCE_EXHAUSTED {"retryDelay":"127s"}');
      return `ok:${apiKey}`;
    });
    expect(await withApiKeyRotation(call)).toBe('ok:key-b');

    const statuses = Object.fromEntries(getKeyStatuses().map(s => [s.id, s]));
    expect(statuses.a.cooldownRemainingMs).toBeGreaterThan(120_000);
    expect(statuses.a.cooldownRemainingMs).toBeLessThanOrEqual(127_000);
    expect(statuses.b.cooldownRemainingMs).toBe(0);
    expect(statuses.c.cooldownRemainingMs).toBe(0);
    expect(statuses.b.isActive).toBe(true);
  });

  it('tries the key that last worked first, and leaves the others in their order', async () => {
    const { withApiKeyRotation } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
      { id: 'c', label: 'C', key: 'key-c' },
    ]);
    // First pass: a is spent, b answers and becomes the active key.
    await withApiKeyRotation(async (apiKey) => {
      if (apiKey === 'key-a') throw rateLimit();
      return apiKey;
    });
    const tried: string[] = [];
    await withApiKeyRotation(async (apiKey) => { tried.push(apiKey); return apiKey; });
    expect(tried).toEqual(['key-b']);
  });

  it('rests a repeat offender longer, without ever writing the key off', async () => {
    const { withApiKeyRotation, getKeyStatuses } = await loadPool([
      { id: 'a', label: 'A', key: 'key-a' },
      { id: 'b', label: 'B', key: 'key-b' },
      { id: 'c', label: 'C', key: 'key-c' },
    ]);
    // no retryDelay in these errors: the pool decides the wait itself
    await withApiKeyRotation(async (apiKey) => {
      if (apiKey === 'key-a') throw rateLimit();
      return apiKey;
    });
    expect(getKeyStatuses().find(s => s.id === 'a')!.lastCooldownMs).toBe(60_000);

    // Once the first cooldown lapses the key rejoins the pool — and a second refusal
    // doubles the wait instead of asking again every minute forever.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    await withApiKeyRotation(async (apiKey) => {
      if (apiKey === 'key-c') return apiKey;
      throw rateLimit();
    });
    expect(getKeyStatuses().find(s => s.id === 'a')!.lastCooldownMs).toBe(120_000);
    vi.useRealTimers();
  });
});
