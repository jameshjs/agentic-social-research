# Working instructions for coding agents

Read [README.md](./README.md), [prd.md](./prd.md), and [research.md](./research.md) before proposing architecture or writing features. Those files contain the founder's decisions, hackathon requirements, sponsor descriptions, source links, and deadline conflicts. Do not ask teammates to paste those links again.

## Product contract

- This is a **general hypothesis-to-simulation product**. Any freeform hypothesis must start a run. The TTC fare case is one demonstration, not the application architecture.
- Autonomously generate hypothesis-specific, persistent personas for every visible person. A subset uses LLM reasoning; other individuals may use profile-conditioned rules.
- Agents must make state-changing decisions and interact through a shared world/event log. The visual city and charts must consume that same log/result JSON.
- The **live city is the primary UI**: moving people, buses, cars, homes, shops, and workplaces are product requirements, not decoration.
- Source-backed and speculative runs must be labeled differently. A result observed inside the simulation is not automatically a real-world forecast.
- Human research notes, a question/challenge from agents, and a versioned rerun are required for the primary Papiers track.
- One demo scenario must use actual Toronto urban data for the School of Cities track. See [research.md](./research.md) for the sponsor's data catalogue and direct links.

## Build decisions

- Agree `ScenarioSpec`, `PersonaSpec`, `WorldEvent`, and `RunResult` contracts early; requirements are in PRD §11.
- Support a known-operator path and a generic speculative JSON-action fallback. Do not execute model-authored code.
- Make baseline and intervention replayable from the same seed and initial state.
- Keep API keys server-side and retain an offline/cached demo.
- Preserve the founder's visual and generality requirements when cutting scope. Reduce scene size, depth, analytics, or agent call count first.

## Event gates

- Written rules require an initial Devpost submission with team members and prize categories by Saturday 17 October 2026, 9:00 pm ET.
- Published Sunday deadlines conflict; use the displayed **8:00 am EDT** Devpost cutoff until organizers clarify. See [research.md](./research.md).
- Devpost requires a GitHub code link, write-up, 4-minute pitch, and 1-minute Q&A.

When implementation choices differ from the PRD, update the decision log in `prd.md` and explain why. Keep source provenance in `research.md` or a dedicated data README when datasets are downloaded.
