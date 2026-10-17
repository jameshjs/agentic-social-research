/* The console's orchestrator: Opus 5.5 through the same backend as the agents, routing at low effort and summarising at
 * medium, each with a 120 s timeout and one retry. A router and a summariser only. plan() picks a mode (a poll with the question and options it writes, a live world run for the fare
 * or Bloor policy, or a short reply) and a filter over the 100 agents. summarise() writes prose from the real results
 * it is given; verifyNumbers() then checks every number in that prose against those results. */
'use strict';
const { ORCHESTRATOR, ROUTER } = require('./claude-decision');

/* One Opus call with its own timeout, retried once on a timeout or error; never at the plan's limit. */
async function once(call, prompt, opts) {
  try { return await call(prompt, opts); } catch (e) {
    if (e.limited || e.unavailable) throw e;
    return call(prompt, opts);
  }
}

const AGE_BANDS = ['18-29', '30-49', '50-64', '65+'];
const INCOME_BANDS = ['Less than $30,000', '$30,000-$50,000', '$50,000-$75,000', '$75,000-$100,000', '$100,000 or more'];

const PLAN_SYSTEM = `You route requests in a Toronto policy console. 100 persona agents live near Bloor St W between Bathurst St and Spadina Ave. Each is a US survey respondent's real answers placed in a synthetic Toronto role. You never answer for them and never state results yourself.
Choose one mode:
- "poll": every selected agent answers a question. Write one short, neutral question. Give "options" (2 to 5 short, mutually exclusive answers) only when the user wants specific choices; otherwise leave them empty, and each agent gives a stance on a 5-point scale and how much it affects them.
- "run": a live world run of one prepared policy with the 40 world-decider agents: "fare" (adult TTC fare +$0.50, Fair Pass unchanged) or "bloor" (the Bloor St W cycle track loses its protection).
- "reply": the request is not a poll or a run (a greeting, or a question about what you can do). Answer briefly in "reply".
"filter" selects agents for a poll; leave every field empty for all 100. Within a field any listed value matches; across fields all must match. Runs always use the 40 deciders.
"note": one sentence telling the user what you will do.`;

function planSchema(roster, modes = ['poll', 'run', 'reply'], draft = false) {
  const roles = [...new Set(roster.map((a) => a.role))].sort();
  const hoods = [...new Set(roster.map((a) => a.neighbourhood))].sort();
  const list = (values) => ({ type: 'array', items: { type: 'string', enum: values } });
  const tri = { type: 'string', enum: ['', 'yes', 'no'] };
  return {
    type: 'object', additionalProperties: false,
    required: ['mode', 'question', 'options', 'policy', 'filter', 'reply', 'note', ...(draft ? ['proposal'] : [])],
    properties: {
      ...(draft ? { proposal: { type: 'string' } } : {}),
      mode: { type: 'string', enum: modes }, question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } },
      policy: { type: 'string', enum: ['', 'fare', 'bloor'] }, reply: { type: 'string' }, note: { type: 'string' },
      filter: { type: 'object', additionalProperties: false, required: ['roles', 'age_bands', 'income_bands', 'sex', 'neighbourhoods', 'fare_category', 'has_car', 'has_bike'],
        properties: { roles: list(roles), age_bands: list(AGE_BANDS), income_bands: list(INCOME_BANDS), sex: list(['Female', 'Male']), neighbourhoods: list(hoods),
          fare_category: { type: 'string', enum: ['', 'fair_pass', 'adult'] }, has_car: tri, has_bike: tri } },
    },
  };
}

/* Agents matching a plan's filter: any listed value within a field, every field across fields. No filter: everyone. */
function selectAgents(roster, filter) {
  filter = filter || {};
  const any = (values, v) => !values || !values.length || values.includes(v);
  const tri = (want, v) => !want || (want === 'yes') === Boolean(v);
  return roster.filter((a) => any(filter.roles, a.role) && any(filter.age_bands, a.match_keys.age_band) && any(filter.income_bands, a.match_keys.income_band)
    && any(filter.sex, a.match_keys.sex) && any(filter.neighbourhoods, a.neighbourhood) && (!filter.fare_category || filter.fare_category === a.fare_category)
    && tri(filter.has_car, a.has_car) && tri(filter.has_bike, a.has_bike));
}

function validPlan(plan, modes = ['poll', 'run', 'reply']) {
  if (!plan || !modes.includes(plan.mode)) return false;
  if (plan.mode === 'poll') return Boolean(plan.question) && (plan.options.length === 0 || (plan.options.length >= 2 && plan.options.length <= 5));
  if (plan.mode === 'run') return ['fare', 'bloor'].includes(plan.policy);
  return true;
}

const DRAFT = 'Use mode "poll". In "proposal", draft one concrete policy proposal from this idea: what changes, for whom, and from when, in one or two sentences. State the change only, never its expected effects, benefits or costs.';

/* modes limits the choice; ['poll'] turns any typed text (a hypothesis, a question) into a neutral poll. draft asks
 * for one concrete policy proposal instead, in plan.proposal. */
async function plan(message, roster, call, { modes = ['poll', 'run', 'reply'], draft = false } = {}) {
  const user = draft ? `${message}\n\n(${DRAFT})`
    : modes.length === 1 ? `${message}\n\n(Use mode "${modes[0]}": turn this into one neutral question for the agents.)` : message;
  const { output } = await once(call, { system: [PLAN_SYSTEM], user, schema: planSchema(roster, draft ? ['poll'] : modes, draft) }, ROUTER);
  if (!validPlan(output, draft ? ['poll'] : modes) || (draft && !String(output.proposal || '').trim())) {
    throw new Error(`orchestrator returned an unusable plan: ${JSON.stringify(output).slice(0, 200)}`);
  }
  return output;
}

const SUMMARY_SYSTEM = `You summarise results in a Toronto policy console for a general audience. Use only the data you are given. Every number you write must appear in that data exactly as given; do not compute new numbers. Never speak for an agent except by quoting a reason given in the data. Say that poll answers are survey-style reactions from synthetic agents, not forecasts, and that world runs are synthetic agents in a schematic world. Three or four sentences.`;

async function summarise(request, data, call) {
  const { output } = await once(call, { system: [SUMMARY_SYSTEM], user: `Request: ${request}\n\nData:\n${JSON.stringify(data)}`,
    schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } } }, ORCHESTRATOR);
  const summary = String(output?.summary || '').trim();
  return { summary, ...verifyNumbers(summary, data) };
}

/* Every number in the prose must appear in the data it was written from. */
function verifyNumbers(text, data) {
  const source = JSON.stringify(data);
  const numbers = text.match(/\d+(?:[.,]\d+)*/g) || [];
  const unverified = [...new Set(numbers)].filter((n) => !source.includes(n.replace(/,/g, '')));
  return { numbers_verified: unverified.length === 0, unverified };
}

module.exports = { AGE_BANDS, INCOME_BANDS, PLAN_SYSTEM, SUMMARY_SYSTEM, planSchema, selectAgents, validPlan, plan, summarise, verifyNumbers };
