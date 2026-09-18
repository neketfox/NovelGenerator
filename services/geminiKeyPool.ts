/**
 * Runtime Gemini key pool for the Studio AI actions: multiple user-supplied keys, automatic
 * fallback on 429 (rate limit) / 403 (forbidden), and the active key surfaced to the usage
 * widget. This is a local pet project run only via `npm run dev`, so the pool lives on disk at
 * data/user/secrets.json (services/userSecretsServer.ts) — no browser storage at all. The
 * in-memory cache below exists only so the many synchronous reads elsewhere (rotation order,
 * the settings UI's initial render) don't all have to await a fetch; every mutation persists
 * to the file immediately after updating the cache.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiKeySlot } from '../studioTypes';
import { recordUsage } from './usageTracker';
import { logToTerminal } from '../utils/terminalLogger';

/**
 * How long a key sits out after a 429 when the API does not say. Gemini's free tier is limited
 * per minute as well as per day, and a per-minute limit clears in about a minute — benching a
 * good key for five would burn a pool of three within seconds and then stall the run for
 * minutes, which reads exactly like rotation not working at all.
 */
const KEY_COOLDOWN_MS = 60_000;
/** A key that keeps coming back rate-limited is out for longer each time, up to this. */
const MAX_KEY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Google says how long to wait, in the 429 body: "retryDelay": "24s". Honouring it beats any
 * number this file could invent, and it is the difference between a key resting the 24 seconds
 * it asked for and resting five minutes it did not.
 */
export function retryDelayFromError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /['"]?retryDelay['"]?\s*[:=]\s*['"]?(\d+(?:\.\d+)?)s/i.exec(message);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
}

// See vite.config.ts's '/api/gemini' proxy entry: a direct browser -> Google call can fail with
// a bare "Failed to fetch" on some networks/browsers even with a valid key (corporate firewalls,
// certain CORS-preflight edge cases) — the request never gets far enough to receive an HTTP
// response at all. Routing through the local dev server's proxy instead sidesteps that; there
// is no such proxy in a production static build, so this only applies in dev.
export const GEMINI_REQUEST_OPTIONS = import.meta.env.DEV ? { baseUrl: '/api/gemini' } : undefined;

interface SecretsFile {
  keys: GeminiKeySlot[];
  activeKeyId: string | null;
}

let cache: SecretsFile = { keys: [], activeKeyId: null };

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function onKeyPoolChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function load(): Promise<void> {
  try {
    const res = await fetch('/api/secrets');
    if (res.ok) {
      const data = (await res.json()) as Partial<SecretsFile>;
      cache = { keys: data.keys ?? [], activeKeyId: data.activeKeyId ?? null };
      notify();
    }
  } catch {
    // No dev server (e.g. a static preview build): the pool stays empty and the process-level
    // API_KEY fallback in withApiKeyRotation takes over.
  }
}

// Keyed on fetch rather than on window: the pool lives behind the dev server's API, which is
// reachable from any runtime that can make a request — a terminal run (scripts/run-book.ts)
// should use the author's configured keys too, not only a browser tab.
const ready: Promise<void> = typeof fetch !== 'undefined' ? load() : Promise.resolve();

function persist(): void {
  void fetch('/api/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cache),
  }).catch(() => undefined);
  notify();
}

export function getKeySlots(): GeminiKeySlot[] {
  return cache.keys;
}

export function addKeySlot(label: string, key: string): void {
  cache = { ...cache, keys: [...cache.keys, { id: crypto.randomUUID(), label: label || `Key ${cache.keys.length + 1}`, key }] };
  persist();
}

export function removeKeySlot(id: string): void {
  cache = { ...cache, keys: cache.keys.filter((s) => s.id !== id) };
  persist();
}

export function getActiveKeyLabel(): string {
  const active = cache.keys.find((s) => s.id === cache.activeKeyId) ?? cache.keys[0];
  return active?.label ?? 'default (env)';
}

function setActive(id: string) {
  cache = {
    ...cache,
    activeKeyId: id,
    keys: cache.keys.map((slot) => (slot.id === id && slot.lastCooldownMs ? { ...slot, lastCooldownMs: undefined } : slot)),
  };
  persist();
}

function usableSlots(): GeminiKeySlot[] {
  const now = Date.now();
  return cache.keys.filter((s) => !s.disabledUntil || s.disabledUntil < now);
}

/**
 * Bench a key. `askedMs` is what the API itself asked for, when it said; otherwise the wait
 * doubles each consecutive time this key comes back rate-limited, so a key that is genuinely
 * out of daily quota stops being retried every minute without ever being written off.
 */
function disableSlot(id: string, askedMs: number | null) {
  const now = Date.now();
  cache = {
    ...cache,
    keys: cache.keys.map((slot) => {
      if (slot.id !== id) return slot;
      const previous = slot.lastCooldownMs ?? 0;
      const cooldown = askedMs ?? Math.min(MAX_KEY_COOLDOWN_MS, previous ? previous * 2 : KEY_COOLDOWN_MS);
      return { ...slot, disabledUntil: now + cooldown, lastCooldownMs: cooldown };
    }),
  };
  persist();
}

/** Clears a cooldown once its window has passed, so a recovered key rejoins the pool without a reload. */
function reapCooldowns() {
  const now = Date.now();
  if (cache.keys.some((s) => s.disabledUntil && s.disabledUntil < now)) {
    cache = { ...cache, keys: cache.keys.map((s) => (s.disabledUntil && s.disabledUntil < now ? { ...s, disabledUntil: undefined } : s)) };
    persist();
  }
}

if (typeof window !== 'undefined') {
  setInterval(reapCooldowns, 15_000);
}

export interface KeyStatus extends GeminiKeySlot {
  isActive: boolean;
  cooldownRemainingMs: number;
}

/** Every configured key with its live status, for the settings UI. */
export function getKeyStatuses(): KeyStatus[] {
  reapCooldowns();
  const now = Date.now();
  return cache.keys.map((s) => ({
    ...s,
    isActive: s.id === cache.activeKeyId,
    cooldownRemainingMs: s.disabledUntil ? Math.max(0, s.disabledUntil - now) : 0,
  }));
}

/**
 * The order to try keys in: every key still inside quota first (active key preferred), then —
 * only once every key has failed — every disabled key ordered by soonest reset, so a request
 * still goes out instead of failing outright the moment a cooldown estimate says "not yet".
 * Quota windows are estimates, not guarantees; the real answer is what the API returns.
 */
function rotationOrder(): GeminiKeySlot[] {
  reapCooldowns();
  const usable = usableSlots();
  let pool: GeminiKeySlot[];
  if (usable.length) {
    pool = usable;
  } else {
    pool = [...cache.keys].sort((a, b) => (a.disabledUntil ?? 0) - (b.disabledUntil ?? 0));
  }
  // The key that last worked is tried first; the rest keep their order. Expressed as a
  // partition rather than a comparator, because "put this one first" is not a total order and
  // a sort given one may reorder everything else as it pleases.
  const activeKeyId = cache.activeKeyId;
  const active = pool.filter((slot) => slot.id === activeKeyId);
  return [...active, ...pool.filter((slot) => slot.id !== activeKeyId)];
}

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(message);
}

function isForbidden(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /403|PERMISSION_DENIED/i.test(message);
}

export { SchemaType } from '@google/generative-ai';

// --- rate-limit wait state, surfaced to a UI banner (components/common/RateLimitBanner.tsx) ---

const RATE_LIMIT_POLL_MS = 20_000; // re-check even if no key's own cooldown has elapsed yet
const RATE_LIMIT_MAX_WAIT_MS = 5 * 60 * 1000; // never sleep longer than one cooldown window

export interface RateLimitStatus {
  /** null when nothing is currently rate-limited. */
  resumeAt: number | null;
  attempt: number;
}

let rateLimitStatus: RateLimitStatus = { resumeAt: null, attempt: 0 };
const rateLimitListeners = new Set<(status: RateLimitStatus) => void>();
export function onRateLimitChange(listener: (status: RateLimitStatus) => void): () => void {
  rateLimitListeners.add(listener);
  return () => rateLimitListeners.delete(listener);
}
export function getRateLimitStatus(): RateLimitStatus {
  return rateLimitStatus;
}
function setRateLimitStatus(next: RateLimitStatus) {
  rateLimitStatus = next;
  rateLimitListeners.forEach((l) => l(next));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a call with a raw API key, rotating through the user's key pool on 429/403. This is the
 * SDK-agnostic base: withKeyRotation below hands callers a ready @google/generative-ai client,
 * while lib/image/geminiImage.ts uses this directly to build a @google/genai client instead
 * (the only one of the two SDKs that supports image-output models), without duplicating the
 * rotation/cooldown logic.
 *
 * When every configured key is rate-limited at once, this does not fail the call: it waits for
 * the soonest key to plausibly recover and tries again, forever, surfacing progress through
 * getRateLimitStatus()/onRateLimitChange() so the UI can show "generation will slow down"
 * instead of a dead run. A key rejected as forbidden (invalid/revoked) does not get this
 * treatment — that is not something waiting fixes, so it still throws once the pool runs out.
 */
export async function withApiKeyRotation<T>(call: (apiKey: string) => Promise<T>): Promise<T> {
  await ready; // make sure the pool loaded from disk before deciding there is none configured
  if (!cache.keys.length) {
    const envKey = process.env.API_KEY;
    if (!envKey) throw new Error('No Gemini API key configured. Add one in the API Key settings.');
    return call(envKey);
  }

  let attempt = 0;
  for (;;) {
    const ordered = rotationOrder();
    let lastError: unknown;
    let anyRateLimited = false;

    for (const slot of ordered) {
      try {
        const result = await call(slot.key);
        setActive(slot.id);
        if (rateLimitStatus.resumeAt) setRateLimitStatus({ resumeAt: null, attempt: 0 });
        return result;
      } catch (error) {
        lastError = error;
        if (isRateLimit(error)) {
          anyRateLimited = true;
          const asked = retryDelayFromError(error);
          disableSlot(slot.id, asked);
          // Say which key was set aside, for how long, and who is next: a run that looks like
          // it stopped rotating is usually a pool that emptied faster than anyone could see.
          const remaining = ordered.length - ordered.indexOf(slot) - 1;
          logToTerminal(
            `Key "${slot.label}" is rate-limited; resting ${Math.round((asked ?? KEY_COOLDOWN_MS) / 1000)}s. ` +
            (remaining ? `Trying the next of ${remaining} remaining.` : 'No keys left in quota — waiting for the soonest to recover.'),
            'Keys',
            remaining ? 'warn' : 'error',
          );
          continue;
        }
        if (isForbidden(error)) {
          disableSlot(slot.id, null);
          logToTerminal(`Key "${slot.label}" was refused (forbidden or invalid); skipping it.`, 'Keys', 'warn');
          continue;
        }
        throw error; // not a key-pool problem — surface it immediately
      }
    }

    if (!anyRateLimited) {
      // Every remaining failure was "forbidden" (bad/revoked keys), not a quota to wait out.
      throw lastError instanceof Error ? lastError : new Error('All configured Gemini keys failed.');
    }

    attempt += 1;
    const soonestReset = Math.min(...cache.keys.map((s) => s.disabledUntil ?? Infinity));
    const waitMs = Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.max(RATE_LIMIT_POLL_MS, soonestReset - Date.now()));
    setRateLimitStatus({ resumeAt: Date.now() + waitMs, attempt });
    await sleep(waitMs);
  }
}

/**
 * Runs a Gemini call, rotating through the user's key pool on 429/403. Falls back to the
 * process-level API_KEY (the one the core generator already uses) when no pool is configured,
 * so Studio AI actions work out of the box without requiring the user to open the key manager.
 */
export async function withKeyRotation<T>(call: (client: GoogleGenerativeAI) => Promise<T>): Promise<T> {
  return withApiKeyRotation((apiKey) => call(new GoogleGenerativeAI(apiKey)));
}

export function trackUsageFromResponse(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): void {
  recordUsage({
    timestamp: Date.now(),
    promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    keyId: cache.activeKeyId ?? undefined,
  });
}
