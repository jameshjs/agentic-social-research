/* Server-side Vultr Serverless Inference provider for the hypothesis compiler.
 *
 * A Vultr chat model proposes a schema-constrained scenario
 * (scenario-compiler.js COMPILED_SCENARIO_SCHEMA); the compiler, not the model,
 * decides which levers, units and bounds are legal. The API key is read only
 * from the server environment, sent only as the Authorization header to
 * api.vultrinference.com, and never logged or placed in a returned object.
 *
 * Verified against https://api.vultrinference.com/docs/reference/create-chat-completion
 * and https://api.vultrinference.com/docs/get-started/quickstart (17 Oct 2026):
 * POST /v1/chat/completions, `Authorization: Bearer <key>`, `response_format`
 * json_schema | json_object, and an unknown chat model id silently routes to the
 * default model, so the returned `model` is checked. */
'use strict';

const { COMPILED_SCENARIO_SCHEMA, PROVIDER_RESPONSE_KIND, parseJsonText } = require('./scenario-compiler');

const DEFAULT_BASE_URL = 'https://api.vultrinference.com/v1';
const DEFAULT_COMPILER_MODEL = 'glm-5.3-flash';
const DEFAULT_REASONING_EFFORT = 'low';
const DEFAULT_MAX_COMPLETION_TOKENS = 4096;
const RESPONSE_FORMATS = ['json_schema', 'json_object'];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (s, n = 200) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Model id the response should report: a `:variant` or `-normalize` suffix is parsed off by the gateway. */
function baseModelId(model) {
  return String(model).replace(/:[A-Za-z0-9_-]+$/, '').replace(/-normalize$/, '');
}

/** Shared defaults so the dry run prints exactly what the live provider sends. */
function resolveCompilerOptions(env = process.env, overrides = {}) {
  const effort = overrides.reasoningEffort !== undefined ? overrides.reasoningEffort : (env.VULTR_COMPILER_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT);
  return {
    model: overrides.model || env.VULTR_COMPILER_MODEL || DEFAULT_COMPILER_MODEL,
    responseFormat: overrides.responseFormat || env.VULTR_COMPILER_RESPONSE_FORMAT || 'json_schema',
    // 'omit' leaves the reasoning field out so the model decides.
    reasoningEffort: effort && effort !== 'omit' ? effort : null,
    maxCompletionTokens: overrides.maxCompletionTokens || DEFAULT_MAX_COMPLETION_TOKENS,
  };
}

/** The exact chat-completions body for one compile turn. Contains no credentials. */
function chatCompletionBody(messages, {
  model = DEFAULT_COMPILER_MODEL,
  schema = COMPILED_SCENARIO_SCHEMA,
  responseFormat = 'json_schema',
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  maxCompletionTokens = DEFAULT_MAX_COMPLETION_TOKENS,
} = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('A compile request needs messages');
  if (!RESPONSE_FORMATS.includes(responseFormat)) throw new Error(`responseFormat must be ${RESPONSE_FORMATS.join(' or ')}`);
  let msgs = messages.map(({ role, content }) => ({ role, content }));
  if (responseFormat === 'json_object') {
    // json_object only guarantees a JSON object, so the schema travels in the system turn.
    msgs = msgs.map((m, i) => (i === 0 && m.role === 'system'
      ? { role: 'system', content: `${m.content}\n\nJSON Schema for the answer:\n${JSON.stringify(schema)}` } : m));
  }
  const body = {
    model,
    messages: msgs,
    temperature: 0,
    stream: false,
    max_completion_tokens: maxCompletionTokens,
    response_format: responseFormat === 'json_schema'
      ? { type: 'json_schema', json_schema: { name: 'compiled_scenario', strict: true, schema } }
      : { type: 'json_object' },
  };
  if (reasoningEffort) body.reasoning = { effort: reasoningEffort };
  return body;
}

function scrub(text, apiKey) {
  let s = String(text ?? '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  if (apiKey) s = s.split(apiKey).join('[redacted]');
  return clip(s, 300);
}

async function errorDetail(response, apiKey) {
  try {
    const body = await response.json();
    const type = body?.error?.metadata?.error_type || body?.error?.type;
    const message = body?.error?.message;
    return message || type ? `: ${scrub([type, message].filter(Boolean).join(' — '), apiKey)}` : '';
  } catch { return ''; }
}

function retryDelayMs(response, attempt) {
  const header = response?.headers?.get?.('retry-after');
  const seconds = header == null || header === '' ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 30000) : 1000 * (2 ** attempt);
}

/**
 * Provider for compileHypothesis: `(messages, schema) => envelope` where the
 * envelope is `{kind:'compiler_provider_response', provider:'vultr', model, content, json, usage, ...}`.
 * Throws on HTTP failure after retries, on a model-id mismatch, or on an empty answer.
 */
function createVultrCompilerProvider({
  apiKey = process.env.VULTR_INFERENCE_API_KEY,
  model,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  maxRetries = 2,
  responseFormat,
  reasoningEffort,
  maxCompletionTokens,
  onResponse,
} = {}) {
  if (!apiKey) throw new Error('Set VULTR_INFERENCE_API_KEY on the server');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be a non-negative integer');
  const options = resolveCompilerOptions(process.env, { model, responseFormat, reasoningEffort, maxCompletionTokens });
  if (!RESPONSE_FORMATS.includes(options.responseFormat)) throw new Error(`responseFormat must be ${RESPONSE_FORMATS.join(' or ')}`);
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const expectedModel = baseModelId(options.model);

  async function compile(messages, schema = COMPILED_SCENARIO_SCHEMA) {
    const body = JSON.stringify(chatCompletionBody(messages, { ...options, schema }));
    const started = Date.now();
    let response;
    let attempt = 0;
    for (; ; attempt++) {
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : scrub(error?.message || error, apiKey);
        if (attempt >= maxRetries) throw new Error(`Vultr compiler request failed: ${reason}`);
        await pause(1000 * (2 ** attempt));
        continue;
      }
      if (response.ok) break;
      // 500 is retried once at most (docs: "Once, after a pause"); 429/502/503/504 up to maxRetries.
      const retryable = RETRYABLE.has(response.status) && attempt < maxRetries && !(response.status === 500 && attempt >= 1);
      if (!retryable) throw new Error(`Vultr compiler HTTP ${response.status}${await errorDetail(response, apiKey)}`);
      await pause(retryDelayMs(response, attempt));
    }
    let payload;
    try { payload = await response.json(); } catch { throw new Error('Vultr compiler returned a non-JSON response'); }
    if (payload?.model !== expectedModel) {
      throw new Error(`Vultr compiler model mismatch: expected ${expectedModel}, got ${clip(payload?.model || 'none', 80)}`);
    }
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`Vultr compiler returned no message content (finish_reason ${clip(choice?.finish_reason || 'none', 40)})`);
    }
    let json = null, parse_error = null;
    try { json = parseJsonText(content); } catch (error) { parse_error = clip(error.message); }
    const result = {
      kind: PROVIDER_RESPONSE_KIND, provider: 'vultr', model: payload.model, id: payload.id ?? null,
      content, json, parse_error, usage: payload.usage ?? null, finish_reason: choice.finish_reason ?? null,
      latency_ms: Date.now() - started, http_attempts: attempt + 1,
    };
    if (onResponse) onResponse({ model: result.model, usage: result.usage, latency_ms: result.latency_ms, finish_reason: result.finish_reason, http_attempts: result.http_attempts });
    return result;
  }
  compile.providerName = 'vultr';
  compile.model = expectedModel;
  compile.live = true;
  compile.endpoint = endpoint;
  return compile;
}

/** GET /v1/models (public catalogue). Returns ids plus whether each text model advertises json_schema output. */
async function listModels({
  apiKey = process.env.VULTR_INFERENCE_API_KEY,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 10000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/models`, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Vultr model list HTTP ${response.status}${await errorDetail(response, apiKey)}`);
  const payload = await response.json();
  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const models = entries.filter((m) => m && typeof m.id === 'string').map((m) => {
    const text = Array.isArray(m.output_modalities) ? m.output_modalities.find((o) => o?.type === 'text') : null;
    const formats = text?.supported_parameters?.response_format?.properties?.type?.values;
    return { id: m.id, text_output: Boolean(text), json_schema: Array.isArray(formats) ? formats.includes('json_schema') : null };
  });
  return { ids: models.map((m) => m.id), models };
}

module.exports = {
  DEFAULT_BASE_URL, DEFAULT_COMPILER_MODEL, DEFAULT_REASONING_EFFORT, DEFAULT_MAX_COMPLETION_TOKENS,
  baseModelId, resolveCompilerOptions, chatCompletionBody, createVultrCompilerProvider, listModels,
};
