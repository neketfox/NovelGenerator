import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The keys the author types into the UI live in data/user/secrets.json, and the generator's
 * own Gemini calls must go through that pool — not through a single process-level key. These
 * tests drive services/geminiService.ts with the SDK stubbed, so what is asserted is the
 * wiring: which key each call carries, and what happens when one is rate-limited.
 */
const calls: { apiKey: string }[] = [];

function stubEnvironment(keys: { id: string; label: string; key: string }[], behaviour: (apiKey: string) => unknown) {
  vi.resetModules();
  calls.length = 0;

  vi.doMock('@google/generative-ai', () => ({
    GoogleGenerativeAI: class {
      apiKey: string;
      constructor(apiKey: string) { this.apiKey = apiKey; }
      getGenerativeModel() {
        const apiKey = this.apiKey;
        return {
          generateContent: async () => {
            calls.push({ apiKey });
            const outcome = behaviour(apiKey);
            if (outcome instanceof Error) throw outcome;
            return {
              response: {
                text: () => 'written prose',
                candidates: [{ finishReason: 'STOP' }],
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
              },
            };
          },
        };
      }
    },
    SchemaType: {},
  }));

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    if (url === '/api/secrets' && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, json: async () => ({ keys, activeKeyId: null }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@google/generative-ai');
  vi.restoreAllMocks();
});

describe('the generator uses the keys entered in the UI', () => {
  it('sends a generation call with the author’s configured key', async () => {
    stubEnvironment([{ id: 'a', label: 'Mine', key: 'ui-key-1' }], () => undefined);
    const { generateGeminiText } = await import('../services/geminiService');
    await new Promise(resolve => setTimeout(resolve, 0)); // let the pool load from the file

    await expect(generateGeminiText('Write a scene.')).resolves.toBe('written prose');
    expect(calls.map(call => call.apiKey)).toEqual(['ui-key-1']);
  });

  it('rotates to the next configured key when the first is rate-limited', async () => {
    stubEnvironment(
      [
        { id: 'a', label: 'First', key: 'ui-key-1' },
        { id: 'b', label: 'Second', key: 'ui-key-2' },
      ],
      apiKey => (apiKey === 'ui-key-1' ? new Error('[429] RESOURCE_EXHAUSTED: quota exceeded') : undefined),
    );
    const { generateGeminiText } = await import('../services/geminiService');
    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(generateGeminiText('Write a scene.')).resolves.toBe('written prose');
    // The spent key is tried once, then the run continues on the next one.
    expect(calls.map(call => call.apiKey)).toEqual(['ui-key-1', 'ui-key-2']);
  });

  it('counts the tokens a generation call spent, so the statistics panel is not empty', async () => {
    stubEnvironment([{ id: 'a', label: 'Mine', key: 'ui-key-1' }], () => undefined);
    const { generateGeminiText } = await import('../services/geminiService');
    const { getUsageTotals } = await import('../services/usageTracker');
    await new Promise(resolve => setTimeout(resolve, 0));

    const before = getUsageTotals().totalTokens;
    await generateGeminiText('Write a scene.');
    expect(getUsageTotals().totalTokens).toBe(before + 30);
  });

  it('says what is wrong when no key is configured anywhere', async () => {
    stubEnvironment([], () => undefined);
    const { generateGeminiText } = await import('../services/geminiService');
    await new Promise(resolve => setTimeout(resolve, 0));

    // No pool and no environment key: the message names the fix rather than failing obscurely.
    await expect(generateGeminiText('Write a scene.')).rejects.toThrow(/No Gemini API key configured/);
  });
});
