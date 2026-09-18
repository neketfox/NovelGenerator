import { describe, it, expect, vi, afterEach } from 'vitest';
import { readOllamaCompletion } from '../services/ollamaService';
import { getUsageTotals, recordUsage } from '../services/usageTracker';

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(line => JSON.stringify(line)).join('\n') + '\n';
  return new Response(body, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Ollama reports the tokens it actually spent', () => {
  it('reads prompt_eval_count and eval_count from the terminal record', async () => {
    const usages: { promptTokens: number; completionTokens: number }[] = [];
    const response = ndjsonResponse([
      { message: { content: 'Once ' }, done: false },
      { message: { content: 'upon a time.' }, done: true, prompt_eval_count: 42, eval_count: 17 },
    ]);
    const text = await readOllamaCompletion(response, undefined, usage => usages.push(usage));
    expect(text).toBe('Once upon a time.');
    expect(usages).toEqual([{ promptTokens: 42, completionTokens: 17 }]);
  });

  it('calls onUsage once per completion, not once per frame', async () => {
    const usages: unknown[] = [];
    const response = ndjsonResponse([
      { response: 'a', done: false },
      { response: 'b', done: false },
      { response: 'c', done: true, prompt_eval_count: 5, eval_count: 3 },
    ]);
    await readOllamaCompletion(response, undefined, usage => usages.push(usage));
    expect(usages).toHaveLength(1);
  });

  it('does not call onUsage when Ollama reports no counts at all', async () => {
    const usages: unknown[] = [];
    const response = ndjsonResponse([{ response: 'done', done: true }]);
    await readOllamaCompletion(response, undefined, usage => usages.push(usage));
    expect(usages).toHaveLength(0);
  });

  it('still returns the prose when no onUsage callback is given, exactly as before', async () => {
    const response = ndjsonResponse([{ response: 'Fine either way.', done: true, prompt_eval_count: 5, eval_count: 5 }]);
    expect(await readOllamaCompletion(response)).toBe('Fine either way.');
  });
});

describe('the statistics panel counts Ollama tokens the same way it counts Gemini’s', () => {
  it('feeds into the same running total, with no key id (Ollama has no key pool)', () => {
    const before = getUsageTotals().totalTokens;
    recordUsage({ timestamp: Date.now(), promptTokens: 42, completionTokens: 17 }); // what llmService.ts's trackOllamaUsage records
    const after = getUsageTotals();
    expect(after.totalTokens).toBe(before + 59);
    expect(after.promptTokens).toBeGreaterThanOrEqual(42);
  });
});

describe('llmService dispatches Ollama usage into the tracker', () => {
  it('records tokens from a non-streaming Ollama call, the path the generator actually uses', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([
      { message: { content: 'Prose.' }, done: true, prompt_eval_count: 11, eval_count: 22 },
    ])));

    const { generateText } = await import('../services/llmService');
    const { getUsageTotals: totalsAfterReset } = await import('../services/usageTracker');
    const before = totalsAfterReset().totalTokens;

    // The same overrideConfig path hooks/useBookGenerator.ts passes down from the wizard's
    // provider toggle — not routed through localStorage/window, which this (node) test has none of.
    await generateText('Write a scene.', undefined, undefined, 0.7, undefined, undefined, {
      provider: 'ollama', ollamaModel: 'llama3.1', ollamaEndpoint: '/api/ollama',
    });
    expect(totalsAfterReset().totalTokens).toBe(before + 33);
  });
});
