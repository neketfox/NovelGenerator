import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { systemContract } from '../utils/novel/prompts';
import { chunkText } from '../lib/rag/chunking';
import { getUsageTotals, recordUsage, onUsageChange } from '../services/usageTracker';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('manuscript language in the system contract', () => {
  it('writes in English when no language was asked for', () => {
    expect(systemContract()).toContain('Write the prose in English');
  });

  it('carries the requested language into the contract every stage shares', () => {
    const contract = systemContract('Ukrainian');
    expect(contract).toContain('Write the prose in Ukrainian');
    // Structured answers stay machine-readable whatever the manuscript language is.
    expect(contract).toContain('JSON key, in English');
  });

  it('leaves no unfilled hole for any language', () => {
    expect(systemContract('Polish')).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('RAG chunking', () => {
  it('splits long prose into overlapping chunks so a sentence is never cut out of context', () => {
    const text = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0].text.split(' ');
    const second = chunks[1].text.split(' ');
    // The tail of one chunk reappears at the head of the next: that overlap is the point.
    expect(second).toContain(first[first.length - 1]);
  });

  it('returns nothing for empty prose rather than an empty chunk', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('keeps a short section whole', () => {
    expect(chunkText('A single short line.')).toHaveLength(1);
  });
});

describe('usage tracking', () => {
  it('adds prompt and completion tokens into a running total', () => {
    const before = getUsageTotals().totalTokens;
    recordUsage({ timestamp: Date.now(), promptTokens: 100, completionTokens: 40 });
    const after = getUsageTotals();
    expect(after.totalTokens).toBe(before + 140);
    expect(after.requestsPerMinute).toBeGreaterThan(0);
  });

  it('tells a listener when usage changes, so the header can follow a run', () => {
    const listener = vi.fn();
    const stop = onUsageChange(listener);
    recordUsage({ timestamp: Date.now(), promptTokens: 1, completionTokens: 1 });
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    recordUsage({ timestamp: Date.now(), promptTokens: 1, completionTokens: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('counts only the last minute as the current rate', () => {
    recordUsage({ timestamp: Date.now() - 120_000, promptTokens: 10, completionTokens: 10 });
    const rate = getUsageTotals().requestsPerMinute;
    recordUsage({ timestamp: Date.now(), promptTokens: 10, completionTokens: 10 });
    expect(getUsageTotals().requestsPerMinute).toBe(rate + 1);
  });
});
