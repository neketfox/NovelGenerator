import { generateText, getStoredProviderConfig, getStoredValidatorConfig } from '../../services/llmService';
import { setStructuredAttempts, type NovelLLM } from '../novel/v2/llm';

/**
 * The model the import passes run on: the author's own configured provider, the same
 * one the generator uses, routed the same way (the editor model reads and edits, the
 * writer model recovers the construction). Kept here rather than in the component so
 * an import is testable without a browser.
 */
export function importLlm(onCall: (label: string) => void = () => {}): NovelLLM {
  const writer = getStoredProviderConfig();
  const validator = getStoredValidatorConfig();
  // Locally the retries cost only time, so a small model gets more chances (see useBookGenerator).
  setStructuredAttempts(writer.provider === 'ollama' || validator?.provider === 'ollama' ? 5 : 2);
  return async (prompt, system, options = {}) => {
    const role = options.route === 'validator' && validator ? { ...validator, think: false } : writer;
    onCall(role.provider === 'ollama' ? `Ollama:${role.ollamaModel || '?'}` : `Gemini:${role.geminiModel || 'default'}`);
    return generateText(prompt, system, options.schema, options.temperature ?? 0.3, undefined, undefined, role, options.maxTokens, options.json);
  };
}
