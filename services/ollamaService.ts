/**
 * Ollama Service - Local LLM integration
 */

export const DEFAULT_OLLAMA_ENDPOINT = '/api/ollama';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1';

export interface OllamaGeneratePayload {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  format?: 'json' | object;
  think?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    num_ctx?: number;
  };
}

export function parseOllamaTagsResponse(data: any): string[] {
  if (!data || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.map((m: any) => m.name || m.model).filter(Boolean);
}

export function stripThinking(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(cleaned)) throw new Error('Ollama response ended inside a thinking block.');
  if (cleaned.includes('</think>')) {
    cleaned = cleaned.slice(cleaned.lastIndexOf('</think>') + 8);
  }
  return cleaned.trim();
}

export function buildOllamaGeneratePayload(params: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  isJson?: boolean;
  schema?: object;
  stream?: boolean;
  think?: boolean;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
}): OllamaGeneratePayload {
  const payload: OllamaGeneratePayload = {
    model: params.model || DEFAULT_OLLAMA_MODEL,
    prompt: params.prompt,
    stream: params.stream ?? false,
    think: params.think ?? false, // Off unless the caller's provider role enables it.
    options: {
      temperature: params.temperature ?? 0.7,
      ...(params.maxTokens !== undefined ? { num_predict: params.maxTokens } : {}),
      ...(params.topP !== undefined ? { top_p: params.topP } : {}),
      ...(params.topK !== undefined ? { top_k: params.topK } : {}),
      ...(params.numCtx !== undefined ? { num_ctx: params.numCtx } : {})
    }
  };

  const antiThinkingPrompt = "Do not output thinking, inner monologue, reasoning steps, or <think> tags. Output only direct final response.";
  if (params.think) {
    if (params.system) payload.system = params.system;
  } else if (params.system) {
    payload.system = `${params.system}\n\n${antiThinkingPrompt}`;
  } else {
    payload.system = antiThinkingPrompt;
  }

  if (params.schema || params.isJson) {
    payload.format = params.schema || 'json';
  }

  return payload;
}

/**
 * Fetch locally available models from Ollama
 */
export async function fetchOllamaModels(endpoint: string = DEFAULT_OLLAMA_ENDPOINT): Promise<string[]> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/api/tags`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Ollama server responded with status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return parseOllamaTagsResponse(data);
  } catch (error: any) {
    console.error('Failed to fetch models from Ollama:', error);
    throw new Error(`Cannot connect to Ollama at ${url}. Make sure Ollama is running ('ollama serve'). Details: ${error.message}`);
  }
}

/**
 * The context window a local model is given, and the ceiling the transport will raise it to.
 *
 * Ollama's own default window is 4096 tokens on most builds, which a chapter prompt plus its
 * answer does not fit into — and Ollama does not refuse that, it writes until the window is
 * full and stops mid-sentence. That arrives here as done_reason "length", and rejecting it is
 * right: half a chapter is not a chapter. But rejecting it forever is not, when the fix is a
 * number.
 */
export const DEFAULT_OLLAMA_NUM_CTX = 8192;
export const MAX_OLLAMA_NUM_CTX = 32768;

/** A response cut off because the window filled. Distinguished so callers can widen and retry. */
export class OllamaTruncatedError extends Error {
  constructor(public readonly numCtx: number | undefined, message?: string) {
    super(message ?? 'Ollama output reached its token limit; the incomplete response was rejected.');
    this.name = 'OllamaTruncatedError';
  }
}

export interface OllamaUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Read every NDJSON frame and require a successful terminal record. Partial text is never
 * success. The terminal record also carries Ollama's own token counts (prompt_eval_count,
 * eval_count) — the local equivalent of Gemini's usageMetadata — reported through onUsage so
 * the statistics panel is not Gemini-only.
 */
export async function readOllamaCompletion(
  response: Response,
  onChunk?: (text: string) => void,
  onUsage?: (usage: OllamaUsage) => void,
): Promise<string> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ollama request failed [${response.status}]: ${detail || response.statusText}`);
  }
  let content = '';
  let completed = false;
  const consume = (frame: any) => {
    if (frame.error) throw new Error(`Ollama stream error: ${frame.error}`);
    if (completed) throw new Error('Ollama sent content after the terminal record.');
    const text = frame.message?.content ?? frame.response ?? '';
    if (typeof text !== 'string') throw new Error('Malformed Ollama content.');
    content += text;
    // The frames were always arriving one at a time; nothing was listening. Reporting them costs
    // nothing and changes nothing about what is accepted: the caller still receives only the verified
    // final content, and a stream that ends without its completion record is still rejected whole.
    if (text && onChunk) onChunk(text);
    if (frame.done) {
      if (['length', 'max_tokens'].includes(frame.done_reason)) throw new OllamaTruncatedError(undefined);
      completed = true;
      // Only the terminal record carries these — a model that never finished a turn spent
      // nothing worth counting, so no onUsage call for the frames that led up to it.
      if (onUsage && (typeof frame.prompt_eval_count === 'number' || typeof frame.eval_count === 'number')) {
        onUsage({ promptTokens: frame.prompt_eval_count ?? 0, completionTokens: frame.eval_count ?? 0 });
      }
    }
  };
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) consume(JSON.parse(line));
      }
      if (buffer.trim()) consume(JSON.parse(buffer));
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  } else consume(await response.json());
  if (!completed) throw new Error('Ollama stream ended without a completion record. No partial prose was accepted.');
  const prose = stripThinking(content);
  if (!prose) throw new Error('Ollama returned no final content.');
  return prose;
}

/** Stream transport prevents proxy inactivity; fallback is only for unsupported chat endpoints. */
async function callOllamaOnce(
  prompt: string, system: string, schema: object | undefined, temperature: number,
  model: string, base: string, maxTokens: number | undefined, topP: number | undefined,
  topK: number | undefined, think: boolean, numCtx: number,
  onChunk?: (text: string) => void, onUsage?: (usage: OllamaUsage) => void,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Ollama request exceeded the 15 minute deadline.')), 900000);
  try {
    let response = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        stream: true, think, ...(schema ? { format: schema } : {}),
        options: { temperature, num_ctx: numCtx, ...(maxTokens !== undefined ? { num_predict: maxTokens } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}), ...(topK !== undefined ? { top_k: topK } : {}) } }),
    });
    if (response.status === 404 || response.status === 405) {
      await response.body?.cancel();
      response = await fetch(`${base}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(buildOllamaGeneratePayload({ model, prompt, system, temperature, schema, isJson: Boolean(schema), stream: true, think, maxTokens, topP, topK, numCtx })),
      });
    }
    try {
      return await readOllamaCompletion(response, onChunk, onUsage);
    } catch (error) {
      // The reader does not know what window it was reading against; this does.
      if (error instanceof OllamaTruncatedError) throw new OllamaTruncatedError(numCtx, error.message);
      throw error;
    }
  } finally { clearTimeout(timeout); }
}

/**
 * One call to a local model, widening the window rather than losing the work.
 *
 * A truncated answer used to end the chapter: the run stopped with "Ollama output reached its
 * token limit", and the author's only recourse was to find the setting and start again. The
 * book's memory is on disk, so nothing about a retry is delicate — every call here is already
 * one that can be made again — and the remedy is a single number. So a cut-off answer doubles
 * the context window and asks once more, up to the ceiling, and only then gives up, saying what
 * it tried so the number can be raised by hand if the machine has room for it.
 *
 * The prompt is never silently shortened to fit: a chapter written against half its memory is
 * worse than a chapter that failed loudly.
 */
export async function generateOllamaText(
  prompt: string, systemInstruction?: string, schema?: object, temperature = 0.7,
  model = DEFAULT_OLLAMA_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT,
  maxTokens?: number, topP?: number, topK?: number, think = false,
  onChunk?: (text: string) => void, onUsage?: (usage: OllamaUsage) => void,
  numCtx: number = DEFAULT_OLLAMA_NUM_CTX,
  onWiden: (from: number, to: number) => void = () => {},
): Promise<string> {
  const base = endpoint.replace(/\/+$/, '');
  // Thinking is off unless the caller's provider role enables it; only message.content is ever read.
  // Suppressing reasoning in the prompt would defeat a role that deliberately enables thinking.
  const system = `${systemInstruction || ''}${think ? '' : '\nDo not output reasoning or thinking; return only the requested final answer.'}${schema ? `\nReturn one JSON object matching this schema: ${JSON.stringify(schema)}` : ''}`;
  let window = Math.max(1024, Math.round(numCtx) || DEFAULT_OLLAMA_NUM_CTX);
  for (;;) {
    try {
      return await callOllamaOnce(prompt, system, schema, temperature, model, base, maxTokens, topP, topK, think, window, onChunk, onUsage);
    } catch (error) {
      if (!(error instanceof OllamaTruncatedError) || window >= MAX_OLLAMA_NUM_CTX) {
        if (error instanceof OllamaTruncatedError) {
          throw new OllamaTruncatedError(window, `Ollama output reached its token limit even at a ${window}-token context window, the widest this will try. Raise the context window in the AI Provider settings if the machine has room for it, or give the run a model that answers more briefly.`);
        }
        throw error;
      }
      const wider = Math.min(MAX_OLLAMA_NUM_CTX, window * 2);
      onWiden(window, wider);
      window = wider;
      // A partial answer already streamed to the page is not the answer: the caller is told
      // the retry starts over so nothing half-written is mistaken for progress.
      onChunk?.('');
    }
  }
}

/**
 * The streaming call, which until now was not one: it ran the ordinary request to completion and
 * handed the whole answer over as a single chunk, so a writer on Ollama produced nothing to watch and
 * then produced a chapter. The transport was already reading the stream frame by frame; only the
 * reporting was missing.
 */
export async function generateOllamaTextStream(
  prompt: string, onChunk: (chunk: string) => void, systemInstruction?: string,
  model = DEFAULT_OLLAMA_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT,
  schema?: object, temperature = 0.7, maxTokens?: number, onUsage?: (usage: OllamaUsage) => void,
  numCtx: number = DEFAULT_OLLAMA_NUM_CTX, onWiden?: (from: number, to: number) => void,
): Promise<string> {
  return generateOllamaText(prompt, systemInstruction, schema, temperature, model, endpoint, maxTokens, undefined, undefined, false, onChunk, onUsage, numCtx, onWiden);
}

/**
 * The embedder stopped deciding when the cross-encoder arrived: it now nominates one earlier passage
 * per paragraph and a reader judges the pair, so the question asked of it is only whether the right
 * passage is the nearest one. Measured on the 525 cross-chapter pairs in runs/, the 0.6B model
 * nominates the same passage as the 4B for six of the seven known repetitions and costs 6.0s per 96
 * paragraphs against 32.8s — a chapter late in a book goes from about seventy seconds to thirteen.
 *
 * The seventh is a real loss: it nominates the wrong neighbour for a sentence copied whole out of the
 * first chapter, and the reader then sees an unrelated pair. That one is already caught word for word
 * by copiedFromEarlier, which is why the trade is worth taking rather than merely cheap.
 */
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = 'qwen3-embedding:0.6b';

/**
 * Embeddings for measured prose checks. Batched in one request; a short or ragged response is an
 * error rather than a silent partial result, because a missing vector would read as "no repetition".
 */
export async function embedOllama(
  inputs: string[], model = DEFAULT_OLLAMA_EMBEDDING_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT,
): Promise<number[][]> {
  if (!inputs.length) return [];
  const base = endpoint.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Ollama embedding request exceeded the 5 minute deadline.')), 300000);
  try {
    const response = await fetch(`${base}/api/embed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model, input: inputs }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama embedding request failed [${response.status}]: ${detail || response.statusText}`);
    }
    const data = await response.json();
    const vectors = data?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== inputs.length
      || vectors.some((vector: unknown) => !Array.isArray(vector) || !vector.length || vector.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error(`Ollama returned no usable embeddings for ${inputs.length} input(s) from ${model}.`);
    }
    return vectors as number[][];
  } finally { clearTimeout(timeout); }
}
