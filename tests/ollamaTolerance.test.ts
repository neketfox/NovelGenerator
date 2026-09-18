import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { structuredResponse, setStructuredAttempts, getStructuredAttempts } from '../utils/novel/v2/llm';
import { validateBookDesign } from '../utils/novel/v2/designer';

const design = (chapters = 2) => ({
  contract: { working_title: 'T' },
  profile: {},
  dramatic_core: {},
  style_contract: {},
  characters: [{ id: 'C01', name: 'A' }],
  world_rules: [{ id: 'W01', rule: 'r' }],
  causal_map: [{ id: 'E01', event: 'e' }],
  ending: {},
  chapter_map: Array.from({ length: chapters }, (_, index) => ({ chapter: index + 1 })),
});

afterEach(() => setStructuredAttempts(2));

describe('a local model is given more rope, because its tokens are free', () => {
  it('holds the attempt budget inside a sane range', () => {
    setStructuredAttempts(5);
    expect(getStructuredAttempts()).toBe(5);
    setStructuredAttempts(0);
    expect(getStructuredAttempts()).toBe(1); // never zero: that would call nothing at all
    setStructuredAttempts(99);
    expect(getStructuredAttempts()).toBe(6); // never unbounded: a broken model must still stop
  });

  it('keeps asking a fumbling model up to the raised budget, and succeeds late', async () => {
    setStructuredAttempts(5);
    let calls = 0;
    const llm = vi.fn(async () => {
      calls += 1;
      return calls < 5 ? 'here is the json you asked for:' : JSON.stringify({ title: 'ok' });
    });
    const result = await structuredResponse('p', 's', llm, ['title'], parsed => parsed as { title: string });
    expect(result.title).toBe('ok');
    expect(calls).toBe(5);
  });

  it('still gives up at the budget instead of looping on a model that never complies', async () => {
    setStructuredAttempts(2);
    const llm = vi.fn(async () => 'not json at all');
    await expect(structuredResponse('p', 's', llm, ['title'], parsed => parsed)).rejects.toThrow();
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('raises the budget on its own when either route runs on Ollama', () => {
    // The wiring, not the value: the generator must decide this from the configured provider.
    const hook = fs.readFileSync('hooks/useBookGenerator.ts', 'utf-8');
    expect(hook).toMatch(/setStructuredAttempts\(/);
    expect(hook).toMatch(/provider === 'ollama'/);
  });

  it('does not lose a design because a small model fumbled its ids', () => {
    // The crash this answers: "Design entries need stable string ids", on Ollama.
    const raw = design();
    delete (raw.characters[0] as { id?: string }).id;
    raw.world_rules[0].id = 'C01';
    expect(() => validateBookDesign(raw, 2)).not.toThrow();
  });
});
