# Counterfactual Lab — Hack the Valley 11

A general, human-guided social simulation and policy decision product. Enter **any hypothesis**; the system generates relevant synthetic personas, lets them act and interact in a live city, compares baseline with intervention, and explains the simulated effects. A linked economic dashboard shows household, business, public-budget, and access impacts with charts, scenario trajectories, subgroup comparisons, and uncertainty. When evidence is thin, it still runs and labels the output as speculative. The live world is the primary interface; the decision dashboard and cited brief explain what a policymaker could and could not conclude.

## Start here

1. [Product requirements](./prd.md) — final product scope, user flow, P0 acceptance criteria, architecture, data contracts, visual requirements, named team workstreams, demo, and implementation gaps.
2. [Research and source dossier](./research.md) — sponsor briefs, event rules/deadline conflicts, hacker package, Toronto dataset catalogue, and modelling evidence. Teammates and coding agents should read this before researching from scratch.
3. [Coding-agent instructions](./AGENTS.md) — concise shared implementation contract so agents do not revert to a single fare scenario.

## Confirmed direction

- **Primary prize:** [Papiers Autoresearch](https://hack-the-valley-11.devpost.com/) — agents must use human research notes and judgment, ask for expertise, and show a human-guided revision.
- **Secondary prize:** [U of T School of Cities](https://hack-the-valley-11.devpost.com/) — one demo must address a concrete Toronto urban issue using Toronto data. [Sponsor data guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk).
- **Additional category:** sustainable FinTech & Economic Inclusion, if the demo actually explains household/business economic effects.
- **Generality proof:** two different live hypotheses pass through one system, plus an unprepared prompt exercises the speculative fallback.
- **Visual proof:** buses, cars, people, homes, shops, and workplaces react to logged agent decisions. Visual changes and metrics come from the same run result.
- **Decision proof:** A city action links to a charted economic effect; the dashboard compares status quo and proposal, affected groups, future scenario paths, assumptions, and missing evidence. Unsupported forecasts are marked not estimable.
- **Demo pair:** Toronto transit fare change and a hypothetical Ontario minimum wage change affecting Toronto; an unprepared prompt tests the generic speculative path.
- **Owners:** Aadit — city and dashboard frontend; Steven — personas and AI decisions; James — world engine, metric computation, orchestrator, and backend; Meet — hypothesis compiler, metric definitions, evidence and human research loop, integration, pitch, and submission.

## Event-critical facts

- Written rules require an **initial Devpost entry by Saturday, 17 October 2026 at 9:00 pm ET**, including team members and prize categories.
- Published final times conflict: [Devpost dates](https://hack-the-valley-11.devpost.com/details/dates) show **Sunday 8:00 am EDT**; [written rules](https://hack-the-valley-11.devpost.com/rules) say 10:00 am ET; [live schedule](https://hackthevalley.io/schedule) says 9:30 am. **Use 8:00 am as the cutoff** until organizers clarify. Internal target: 5:30 am.
- Devpost requires a **GitHub code link** to be judged, a write-up, a **4-minute pitch**, and **1-minute Q&A**.
- Teams may have up to **4** members. Event code must be created within the official hackathon window under the [rules](https://hack-the-valley-11.devpost.com/rules).
- School of Cities workshop: Friday 10:00–11:00 pm, IA 2100. Papier.ai workshop: Saturday noon–1:00 pm, IA 2160, per [live schedule](https://hackthevalley.io/schedule).

## Repository state

This repository currently contains planning/research documents only. The model/API, exact visual stack, and deployment target are first-hour implementation choices in [PRD §17](./prd.md#17-locked-decisions-and-implementation-gaps). Do not build a fare-specific app: TTC fares are one demo scenario for a general hypothesis engine.
