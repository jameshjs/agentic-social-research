/* Drop-in client for the persona agent server (runtime/server.js). No dependencies; works in the browser and in Node 18+.
 * The server also serves the site, so the default is same-origin (serverUrl ''); Node callers pass a full serverUrl.
 * Browsers never carry an access key: locally, same-origin needs none; teammates' own local server holds the key and
 * forwards server-to-server. accessKey is for Node callers only.
 *   const client = AgentsClient.create({ serverUrl = '', accessKey })      (also accepts { url, key })
 *   client.askAgents(question, { options, filter, ids, concurrency, orchestrate = true, summarise = true,
 *                                onPlan, onStart, onAnswer, onSummary, onDone, onLimit, onReplay, onError })  → the 'done' payload
 *   client.runPolicy('fare' | 'bike' | 'bloor', { concurrency, onStart, onDecision, onTick, onDone, ... })  → the experiment.v1 RunResult
 *   client.chat(message, { modes, onPlan, onReply, ...the handlers above })   client.health()   client.agents()   client.latestReplay(kind, policy)
 *     modes limits the orchestrator, e.g. ['poll', 'reply'] so a chat never starts a world run (the default allows poll, run, reply).
 * A ready-made client, window.PersonaAgents, is same-origin unless PersonaAgents.configure({ url }) or
 * window.PERSONA_AGENTS = { url } names another server. It never reads or stores a key.
 * Poll answers are survey-style reactions, not forecasts. */
(function (root) {
  'use strict';
  const fail = (message, status, extra) => Object.assign(new Error(message), { status }, extra);

  function create(options = {}) {
    const settings = typeof options === 'function' ? options : () => options;
    const conf = () => {
      const s = settings();
      return { url: String(s.serverUrl ?? s.url ?? '').replace(/\/$/, ''), key: s.accessKey ?? s.key ?? '' };
    };
    const headers = () => { const { key } = conf(); return { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }; };

    async function getJSON(path) {
      const r = await fetch(conf().url + path, { headers: headers() });
      if (r.status === 401) throw fail('access key required', 401);
      if (!r.ok) throw fail(`HTTP ${r.status}`, r.status);
      return r.json();
    }

    /* POST, then read the server-sent events and call on<Event>(data) for each. */
    async function stream(path, body, handlers) {
      const r = await fetch(conf().url + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      if (r.status === 401) throw fail('access key required', 401);
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw fail(j.error || `HTTP ${r.status}`, r.status, { replay: Boolean(j.replay) }); }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', last = null, error = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const raw = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);
          if (handlers.onEvent) handlers.onEvent(event, data);
          const handler = handlers[`on${event[0].toUpperCase()}${event.slice(1)}`];
          if (handler) handler(data);
          if (event === 'done' || event === 'replay' || event === 'reply') last = { event, data };   // a chat may end in a reply
          if (event === 'error') error = data;
        }
      }
      if (last) return last;
      throw fail(error ? error.message : 'the server ended the stream without a result');
    }

    return {
      config: conf,
      async askAgents(question, { options, filter, ids, concurrency, orchestrate = true, summarise = true, ...handlers } = {}) {
        return (await stream('/ask', { question, options, filter, ids, concurrency, orchestrate, summarise }, handlers)).data;
      },
      /* Resolves with the run's experiment.v1 RunResult: on 'done' (live) or 'replay' (saved run). */
      async runPolicy(policy, { concurrency, ...handlers } = {}) {
        const { event, data } = await stream(`/run/${policy}`, { concurrency }, handlers);
        if (event === 'replay') return data.record.result;
        return data.result || getJSON(`/saves/${encodeURIComponent(data.file)}?part=result`);
      },
      async chat(message, { concurrency, modes, ...handlers } = {}) { return (await stream('/chat', { message, concurrency, modes }, handlers)).data; },
      health: () => getJSON('/health'),
      agents: () => getJSON('/agents'),
      latestReplay: (kind, policy) => getJSON(`/replay/latest?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(policy ? { policy } : {}) })}`),
    };
  }

  /* The ready-made client: a server URL only (same-origin by default), never a key. */
  const set = {};
  const defaults = () => ({ url: set.url || (root && root.PERSONA_AGENTS && root.PERSONA_AGENTS.url) || '' });
  function configure({ url } = {}) { if (url !== undefined) set.url = url; }

  const api = { create, configure, ...create(defaults) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.PersonaAgents = api; root.AgentsClient = { create }; }
})(typeof window !== 'undefined' ? window : null);
