import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  generateOllamaText,
  readOllamaCompletion,
  buildOllamaGeneratePayload,
  OllamaTruncatedError,
  DEFAULT_OLLAMA_NUM_CTX,
  MAX_OLLAMA_NUM_CTX,
} from '../services/ollamaService';

function ndjson(lines: object[]): Response {
  return new Response(lines.map(line => JSON.stringify(line)).join('\n') + '\n', { status: 200 });
}

const truncated = () => ndjson([{ message: { content: 'Half a chapt' }, done: true, done_reason: 'length' }]);
const finished = (text = 'A whole chapter.') => ndjson([{ message: { content: text }, done: true, done_reason: 'stop' }]);

/** Every /api/chat body the transport sent, parsed. */
function recorder(responses: Response[]) {
  const sent: any[] = [];
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return responses[sent.length - 1] ?? finished();
  });
  vi.stubGlobal('fetch', fetchMock);
  return sent;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('a cut-off local answer widens the window instead of ending the run', () => {
  it('names truncation as its own kind of failure', async () => {
    await expect(readOllamaCompletion(truncated())).rejects.toBeInstanceOf(OllamaTruncatedError);
  });

  it('asks again with double the context and keeps the second answer', async () => {
    const sent = recorder([truncated(), finished()]);
    const widenings: [number, number][] = [];
    const text = await generateOllamaText(
      'write chapter four', undefined, undefined, 0.4, 'qwen3:8b', 'http://localhost:11434',
      undefined, undefined, undefined, false, undefined, undefined, 8192,
      (from, to) => widenings.push([from, to]),
    );
    expect(text).toBe('A whole chapter.');
    expect(sent.map(body => body.options.num_ctx)).toEqual([8192, 16384]);
    expect(widenings).toEqual([[8192, 16384]]);
    // The prompt is never trimmed to fit: a chapter written against half its memory is worse
    // than one that failed loudly.
    expect(sent[1].messages[1].content).toBe(sent[0].messages[1].content);
  });

  it('stops at the ceiling and says what it tried, rather than doubling forever', async () => {
    const sent = recorder(Array.from({ length: 8 }, () => truncated()));
    await expect(generateOllamaText(
      'write chapter four', undefined, undefined, 0.4, 'qwen3:8b', 'http://localhost:11434',
      undefined, undefined, undefined, false, undefined, undefined, 8192,
    )).rejects.toThrow(new RegExp(`${MAX_OLLAMA_NUM_CTX}-token context window`));
    expect(sent[sent.length - 1].options.num_ctx).toBe(MAX_OLLAMA_NUM_CTX);
    // 8192 -> 16384 -> 32768, and no attempt past the ceiling.
    expect(sent).toHaveLength(3);
  });

  it('keeps the words the pipeline reads to know a retry is pointless', async () => {
    // utils/novel/v2/llm.ts matches "token limit" to stop retrying an unanswerable call;
    // rephrasing this message would have every truncation retried for nothing.
    recorder([truncated()]);
    await expect(generateOllamaText(
      'x', undefined, undefined, 0.4, 'qwen3:8b', 'http://localhost:11434',
      undefined, undefined, undefined, false, undefined, undefined, MAX_OLLAMA_NUM_CTX,
    )).rejects.toThrow(/token limit/);
  });

  it('never retries a failure widening cannot fix', async () => {
    const sent = recorder([ndjson([{ error: 'model "ghost" not found' }])]);
    await expect(generateOllamaText('hello', undefined, undefined, 0.4, 'ghost')).rejects.toThrow(/not found/);
    expect(sent).toHaveLength(1);
  });

  it('starts from the window the author configured, and sends it on the fallback endpoint too', async () => {
    const sent = recorder([finished()]);
    await generateOllamaText(
      'hi', undefined, undefined, 0.4, 'qwen3:8b', 'http://localhost:11434',
      undefined, undefined, undefined, false, undefined, undefined, 16384,
    );
    expect(sent[0].options.num_ctx).toBe(16384);
    expect(buildOllamaGeneratePayload({ model: 'm', prompt: 'p', numCtx: 16384 }).options?.num_ctx).toBe(16384);
  });

  it('defaults to a window a chapter actually fits in', () => {
    expect(DEFAULT_OLLAMA_NUM_CTX).toBeGreaterThanOrEqual(8192);
    expect(MAX_OLLAMA_NUM_CTX).toBeGreaterThan(DEFAULT_OLLAMA_NUM_CTX);
  });
});

describe('the editor model is chosen from what is installed', () => {
  it('offers the same list as the writer, and keeps a configured model that is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.1:8b' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    const { default: ApiKeyManagerModal } = await import('../components/common/ApiKeyManagerModal');
    const { I18nProvider } = await import('../i18n');
    const { saveStoredProviderConfig, saveStoredValidatorConfig } = await import('../services/llmService');
    saveStoredProviderConfig({ provider: 'ollama', ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'qwen3:8b' });
    saveStoredValidatorConfig({ provider: 'ollama', ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'qwen3:8b', enabled: true });

    const html = renderToStaticMarkup(
      React.createElement(I18nProvider, null, React.createElement(ApiKeyManagerModal, { onClose: () => {} })),
    );
    // Both roles expose a context window, so a truncated editor pass is fixable in the same place.
    expect(html).toContain('Context window (tokens)');
    expect(html).toContain('Editor Ollama Model');
  });
});
