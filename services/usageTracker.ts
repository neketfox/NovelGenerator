import type { UsageSample } from '../studioTypes';

/**
 * In-memory usage log for the Studio AI actions (rewrite/expand/continuity/extraction/covers).
 * The core generator's own token accounting (utils/apiResilienceUtils.ts) is untouched — this
 * is a separate, additive counter scoped to the Studio layer's own calls.
 */
const samples: UsageSample[] = [];
const listeners = new Set<() => void>();

// Gemini free tier: $0.00. Kept as a constant rather than a real pricing table so the widget
// never claims a cost the user isn't actually being charged under the default configuration.
const COST_PER_1K_TOKENS = 0;

export function recordUsage(sample: UsageSample): void {
  samples.push(sample);
  listeners.forEach((l) => l());
}

export function onUsageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestsPerMinute: number;
}

export function getUsageTotals(): UsageTotals {
  const promptTokens = samples.reduce((sum, s) => sum + s.promptTokens, 0);
  const completionTokens = samples.reduce((sum, s) => sum + s.completionTokens, 0);
  const totalTokens = promptTokens + completionTokens;
  const oneMinuteAgo = Date.now() - 60_000;
  const requestsPerMinute = samples.filter((s) => s.timestamp >= oneMinuteAgo).length;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost: (totalTokens / 1000) * COST_PER_1K_TOKENS,
    requestsPerMinute,
  };
}
