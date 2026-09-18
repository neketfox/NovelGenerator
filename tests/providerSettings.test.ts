import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';

/**
 * The provider choice — which model writes, which reviews, and their settings — is global and
 * lives on disk in data/user/preferences.json, beside the language and theme. It used to live
 * in localStorage, where it belonged to one browser rather than to the installation.
 */
async function loadWithStoredSettings(stored: Record<string, unknown>) {
  vi.resetModules();
  const written: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (url === '/api/preferences' && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, json: async () => stored };
    }
    if (url === '/api/preferences' && init?.method === 'PUT') {
      written.push(JSON.parse(init.body ?? '{}'));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
  const llm = await import('../services/llmService');
  await llm.providerSettingsLoaded();
  return { llm, written };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('the provider choice is global and kept on disk', () => {
  it('reads the writer provider from the settings file', async () => {
    const { llm } = await loadWithStoredSettings({
      writer: { provider: 'ollama', ollamaModel: 'llama3.1', ollamaEndpoint: '/api/ollama' },
    });
    expect(llm.getStoredProviderConfig().provider).toBe('ollama');
    expect(llm.getStoredProviderConfig().ollamaModel).toBe('llama3.1');
  });

  it('writes a change straight back to the file', async () => {
    const { llm, written } = await loadWithStoredSettings({});
    llm.saveStoredProviderConfig({ provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'gemma4:31b' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(written.at(-1)).toMatchObject({ writer: { provider: 'ollama', ollamaModel: 'gemma4:31b' } });
  });

  it('leaves the language and theme in that file alone', async () => {
    const { llm, written } = await loadWithStoredSettings({ language: 'uk', theme: 'dark' });
    llm.saveStoredProviderConfig({ provider: 'gemini', ollamaEndpoint: '/api/ollama', ollamaModel: 'llama3.1' });
    await new Promise(resolve => setTimeout(resolve, 0));
    // The endpoint merges at the top level, so the write names only what it changes.
    expect(Object.keys(written.at(-1) as object).sort()).toEqual(['editor', 'writer']);
  });

  it('restores a configured editor model, including its thinking setting', async () => {
    const { llm } = await loadWithStoredSettings({
      writer: { provider: 'gemini', ollamaModel: 'llama3.1', ollamaEndpoint: '/api/ollama' },
      editor: { enabled: true, provider: 'ollama', ollamaModel: 'gemma4:31b', ollamaEndpoint: '/api/ollama', think: true },
    });
    expect(llm.getStoredValidatorConfig()).toMatchObject({ provider: 'ollama', ollamaModel: 'gemma4:31b', think: true });
  });

  it('reports no editor when the stored one is switched off, so the writer is not its own judge', async () => {
    const { llm } = await loadWithStoredSettings({
      editor: { enabled: false, provider: 'gemini', ollamaModel: 'llama3.1', ollamaEndpoint: '/api/ollama' },
    });
    expect(llm.getStoredValidatorConfig()).toBeUndefined();
  });

  it('falls back to Gemini defaults when the file cannot be read at all', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no dev server'); }));
    const llm = await import('../services/llmService');
    await llm.providerSettingsLoaded();
    expect(llm.getStoredProviderConfig()).toEqual(llm.DEFAULT_LLM_CONFIG);
  });

  it('no longer keeps the provider choice in browser storage', () => {
    const source = fs.readFileSync('services/llmService.ts', 'utf-8');
    expect(source).not.toContain('localStorage');
  });
});

describe('the creation form no longer carries the provider section', () => {
  it('leaves provider and key wiring to the key manager', () => {
    const form = fs.readFileSync('components/UserInput.tsx', 'utf-8');
    for (const gone of ['saveStoredProviderConfig', 'fetchOllamaModels', 'saveStoredValidatorConfig']) {
      expect(form, `the form still wires ${gone}`).not.toContain(gone);
    }
  });

  it('is where the key manager now carries them instead', () => {
    const modal = fs.readFileSync('components/common/ApiKeyManagerModal.tsx', 'utf-8');
    for (const moved of ['saveStoredProviderConfig', 'saveStoredValidatorConfig', 'fetchOllamaModels', 'addKeySlot']) {
      expect(modal).toContain(moved);
    }
  });
});
