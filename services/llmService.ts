/**
 * Unified LLM Gateway
 * Dispatches requests to either Google Gemini or local Ollama based on user configuration.
 */

import { LLMProviderConfig } from '../types';
import { generateGeminiText, generateGeminiTextStream } from './geminiService';
import { generateOllamaText, generateOllamaTextStream, DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_NUM_CTX, type OllamaUsage } from './ollamaService';
import { logToTerminal } from '../utils/terminalLogger';
import { recordUsage } from './usageTracker';

// Ollama has no key pool (no keyId), but the statistics panel should count its tokens the same
// way it counts Gemini's — the panel does not otherwise know the run switched provider.
function trackOllamaUsage(usage: OllamaUsage): void {
  recordUsage({ timestamp: Date.now(), promptTokens: usage.promptTokens, completionTokens: usage.completionTokens });
}

export const DEFAULT_LLM_CONFIG: LLMProviderConfig = {
  provider: 'gemini',
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  ollamaNumCtx: DEFAULT_OLLAMA_NUM_CTX
};

/**
 * A run that had to widen the window tells the author about it once, not once per call: the
 * useful message is "this model needs a bigger window", and repeating it every chapter buries
 * the run log it is written into.
 */
const widened = new Set<string>();

function reportWidening(model: string, from: number, to: number): void {
  const note = `${model}:${to}`;
  logToTerminal(
    `${model} ran out of room at ${from} tokens; retrying the same call with a ${to}-token context window. Set this permanently in the AI Provider settings to avoid the retry.`,
    'LLM',
    widened.has(note) ? 'llm' : 'warn',
  );
  widened.add(note);
}

/**
 * Which model writes and which model reviews, kept in data/user/preferences.json beside the
 * language and theme — the same place everything else about this installation lives. No
 * browser storage: the choice belongs to the machine running the book, not to one tab.
 *
 * Reads are synchronous because every model call makes one, so the file is loaded once into
 * this cache at startup and written through on each change. A call made in the first moments
 * after boot, before the load resolves, sees the defaults — the same tradeoff the key pool
 * makes, and generation never starts that early.
 */
interface ProviderSettings {
  writer: LLMProviderConfig;
  /** Undefined means the writer judges its own prose, which is the weakest configuration. */
  editor?: LLMProviderConfig & { enabled: boolean };
}

let settings: ProviderSettings = { writer: DEFAULT_LLM_CONFIG };

function readProvider(raw: unknown, fallback: LLMProviderConfig): LLMProviderConfig {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  return {
    provider: parsed.provider === 'ollama' ? 'ollama' : 'gemini',
    ollamaEndpoint: (parsed.ollamaEndpoint as string) || fallback.ollamaEndpoint,
    ollamaModel: (parsed.ollamaModel as string) || fallback.ollamaModel,
    ...(typeof parsed.think === 'boolean' ? { think: parsed.think } : {}),
    // Only present when the author typed one: stored configs keep their exact shape otherwise.
    ...(typeof parsed.geminiModel === 'string' && parsed.geminiModel.trim() ? { geminiModel: parsed.geminiModel.trim() } : {}),
    ...(Number.isFinite(parsed.ollamaNumCtx) ? { ollamaNumCtx: Number(parsed.ollamaNumCtx) } : fallback.ollamaNumCtx ? { ollamaNumCtx: fallback.ollamaNumCtx } : {}),
  };
}

async function loadProviderSettings(): Promise<void> {
  try {
    const response = await fetch('/api/preferences');
    if (!response.ok) return;
    const file = await response.json() as { writer?: unknown; editor?: unknown };
    if (file.writer) settings.writer = readProvider(file.writer, DEFAULT_LLM_CONFIG);
    const editor = file.editor as Record<string, unknown> | undefined;
    if (editor && editor.enabled !== false) {
      settings.editor = { ...readProvider(editor, settings.writer), think: Boolean(editor.think), enabled: true };
    }
  } catch {
    // No dev server: the defaults stand, and nothing the author set is lost — it is still on disk.
  }
}

const providerSettingsReady: Promise<void> = typeof fetch !== 'undefined' ? loadProviderSettings() : Promise.resolve();

function persistProviderSettings(): void {
  // PUT merges at the top level, so writing the provider choice leaves language and theme alone.
  void fetch('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writer: settings.writer, editor: settings.editor ?? null }),
  }).catch(() => undefined);
}

/** Resolves once the stored choice has been read, for a caller that must not race the load. */
export function providerSettingsLoaded(): Promise<void> {
  return providerSettingsReady;
}

export function getStoredProviderConfig(): LLMProviderConfig {
  return settings.writer;
}

export function saveStoredProviderConfig(config: LLMProviderConfig): void {
  settings.writer = config;
  persistProviderSettings();
}

/**
 * The editor model, when the author wants one distinct from the writer. Undefined means the
 * writer also judges its own prose, which is the weakest configuration and never recommended.
 */
export function getStoredValidatorConfig(): LLMProviderConfig | undefined {
  const editor = settings.editor;
  if (!editor?.enabled) return undefined;
  const { enabled: _enabled, ...config } = editor;
  return { ...config, think: Boolean(editor.think) };
}

export function saveStoredValidatorConfig(config: (LLMProviderConfig & { enabled: boolean }) | undefined): void {
  settings.editor = config?.enabled ? config : undefined;
  persistProviderSettings();
}

/**
 * Unified text generation dispatch
 */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
  schema?: object,
  temperature: number = 0.7,
  topP?: number,
  topK?: number,
  overrideConfig?: LLMProviderConfig,
  maxTokens?: number,
  jsonOnly = false
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();
  const providerTag = config.provider === 'ollama' ? `Ollama:${config.ollamaModel}${config.think ? ' (thinking)' : ''}` : 'Gemini';
  const startTime = Date.now();

  logToTerminal(
    `Dispatching request to ${providerTag} (temp: ${temperature}, JSON: ${Boolean(schema || jsonOnly)}${maxTokens ? `, limit: ${maxTokens} tok` : ''})`,
    'LLM',
    'llm'
  );

  let result: string;
  if (config.provider === 'ollama') {
    result = await generateOllamaText(
      prompt,
      systemInstruction,
      schema || (jsonOnly ? { type: 'object' } : undefined),
      temperature,
      config.ollamaModel,
      config.ollamaEndpoint,
      maxTokens,
      topP,
      topK,
      config.think,
      undefined,
      trackOllamaUsage,
      config.ollamaNumCtx ?? DEFAULT_OLLAMA_NUM_CTX,
      (from, to) => reportWidening(config.ollamaModel, from, to),
    );
  } else {
    result = await generateGeminiText(prompt, systemInstruction, schema, temperature, topP, topK, maxTokens, jsonOnly, config.geminiModel);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const words = result.split(/\s+/).filter(Boolean).length;
  logToTerminal(
    `${providerTag} completed in ${durationSec}s (~${words} words)`,
    'LLM',
    'success'
  );

  return result;
}

/**
 * Unified stream text generation dispatch
 */
export async function generateTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature: number = 0.7,
  overrideConfig?: LLMProviderConfig,
  schema?: object,
  maxTokens?: number,
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();
  const providerTag = config.provider === 'ollama' ? `Ollama:${config.ollamaModel}` : 'Gemini';
  const startTime = Date.now();

  logToTerminal(
    `Starting stream generation via ${providerTag} (temp: ${temperature})`,
    'LLM',
    'llm'
  );

  let chunkCount = 0;
  const wrappedOnChunk = (chunk: string) => {
    chunkCount++;
    onChunk(chunk);
  };

  let result: string;
  if (config.provider === 'ollama') {
    result = await generateOllamaTextStream(
      prompt,
      wrappedOnChunk,
      systemInstruction,
      config.ollamaModel,
      config.ollamaEndpoint,
      schema,
      temperature,
      maxTokens,
      trackOllamaUsage,
      config.ollamaNumCtx ?? DEFAULT_OLLAMA_NUM_CTX,
      (from, to) => reportWidening(config.ollamaModel, from, to),
    );
  } else {
    result = await generateGeminiTextStream(prompt, wrappedOnChunk, systemInstruction, temperature, undefined, undefined, config.geminiModel, schema, maxTokens);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const words = result.split(/\s+/).filter(Boolean).length;
  logToTerminal(
    `${providerTag} stream complete in ${durationSec}s (~${words} words, ${chunkCount} chunks)`,
    'LLM',
    'success'
  );

  return result;
}

