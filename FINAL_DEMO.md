# Final demo runbook — Two Worlds

**Current route:** <https://twotwosmyworld.select/experience/>. **Code:** `main`. Use [the timed pitch script](./pitch/SCRIPT.md) for speaker lines and [TEAM_SYNC.md](./TEAM_SYNC.md) for the current owner handoff.

## Five-minute preflight

1. Open the site at the top on the presentation laptop. Confirm the header reads **Two Worlds** and the Earth-to-Bloor scroll loads. If the venue network blocks map tiles, the drawn-city landing appears on its own after 12 s.
2. Confirm `https://twotwosmyworld.select/api/health` reports the latest deployed `git_sha`. Test one bike and one fare run before judging; both use the same Bathurst–Spadina world and `experiment.v2` result.
3. Confirm `https://twotwosmyworld.select/health` reports `"ok":true` and 100 agents. If Steven's tunnel is down, the 100-agent beat is skipped and the 3D paired run still works.
4. Keep the [pitch deck](./pitch/) and [Devpost draft](./pitch/DEVPOST.md) open. Have a local repository checkout available; `?engine=off` keeps the prepared city replay usable without the live engine.

## Four-minute path

| Time | Action | Proof to show |
| --- | --- | --- |
| 0:00–1:30 | Meet and Steven use slides 1–4. | Policy question, persona tuning against Twin respondents, research loop, human review. Use only the verified numbers and note IDs in the deck. |
| 1:30–1:45 | Aadit scrolls Earth → Toronto → Bloor, types **What if Bloor's protected bike lane were removed?**, and submits. | One freeform input; no prepared-case buttons. |
| 1:45–2:05 | If online, show the 100-agent rating animation and one reason, then move to the 3D lab. | These are survey-style synthetic reactions, not measured Toronto views or inputs to the paired world run. |
| 2:05–2:50 | Show Baseline, then click **See bike impact** and let the tour step through four people whose choice changed (Bloor → side streets, shops elsewhere, TTC). | Same synthetic people, seed and mapped street; protected track is the intervention. The camera follows committed decisions. |
| 2:50–3:25 | Show the four event-reduced tiles below the 3D scene: Bloor bike trips, metres cycled beside cars, sample shop sales and car trips. | The 3D actions and tiles read the same `experiment.v2` result. State the units and three simulated weekdays. |
| 3:25–4:00 | Meet closes. | A hypothesis becomes an inspectable experiment and a next research question, not an automatic policy forecast. |

## If asked for the second scenario

Type **What if the TTC adult fare rises by 50 cents?** into the same box or open `?demo=fare`. The fare run keeps Fair Pass unchanged and reuses the same street, people, seed, engine and renderer. **See TTC impact** steps through riders whose choice changes. The tiles show sample fare receipts, TTC trips, car trips and shop sales.

## Claim boundaries

- City of Toronto geography, counts, 3D massing and signals, TTC schedules, and OpenStreetMap places are mapped context. The 19-person population, individual choices, shop responses and policy effects are synthetic model assumptions. A scheduled Route 7 bus in the tour is service context, not an observed boarding count.
- The 100 Haiku agents' 1–5 poll is a separate survey-style reaction. It does not cause the `experiment.v2` street decisions. Do not describe the Twin survey accuracy as validation of Toronto mobility behaviour.
- Do not claim observed injury changes, business closures, emissions, GDP, citywide TTC revenue or a calibrated Toronto forecast. Unsupported outputs remain **not estimable**.
- For Papiers, show an actual cited passage, evidence evaluation including counterevidence, an agent next step, a genuine human decision and a versioned rerun if available. Offline EvidencePacket fixtures are not Papiers results or human annotations.

## Submission gate

The initial Devpost entry with all four people and prize categories is due **Saturday 17 October, 9:00 pm ET**. Use **Sunday 18 October, 8:00 am EDT** as the conservative final cutoff while organizer pages conflict. Include the GitHub link, write-up, four-minute pitch and one-minute Q&A. See [research.md](./research.md) for the source links.
