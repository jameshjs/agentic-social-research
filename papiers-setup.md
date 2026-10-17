# Papiers CLI: local setup and the MVP research loop

The [official agent guide](https://wiki.papiers.ai/docs/agents) documents a **read-only** CLI for a user's own Papiers library. It can search/read saved documents, passages, highlights, notes and conversations. It cannot search the entire published literature, import a paper, write a note, or publish anything. Use the [curated fare-paper pack](./papers.md) to decide what to save in the Papiers app.

## Current machine state, 17 October 2026

- Node.js `v22.16.0` and `papiers` CLI `0.1.5` are installed on Meet's machine (`npm install -g papiers`).
- `papiers auth status` reported **Token: missing (`PAPIERS_TOKEN`)** when this was written. No Papiers library search/read has been run successfully, and no paper is claimed to have been imported or annotated.
- Other teammates need their own CLI installation/token, or a team-approved read-only token. Never put a token in Git, a prompt, an issue, or a screenshot.

## Complete sign-in on your machine

1. In the Papiers **app**, create a token at **Settings → API tokens**. A teammate with access should save and annotate at least F03 and F11 from [papers.md](./papers.md) in the app.
2. In your own terminal run `papiers auth login` and paste the token into its secure prompt, or expose `PAPIERS_TOKEN` only to the local server process. The CLI stores a login token locally; the environment variable is best for automated runs. Do not paste either into chat.
3. Run `papiers auth status` and `papiers doctor`. If authenticated, verify the *library content*:

```sh
papiers search "fare elasticity" --limit 20 --json
papiers search "retail transit" --limit 20 --json
papiers search "fare capping" --limit 20 --json
papiers read <id-returned-by-search> --json
```

`search` only returns items already present in the signed-in library. A zero-result search is not evidence that a paper does not exist. First save it in the Papiers app and wait for processing.

## The acceptance test for the sponsor demo

Capture one actual CLI JSON result with a paper passage **and one teammate-authored note/highlight**. In the product, show the source, who wrote the note, and the retrieved IDs. The agent must then (a) complete its investigation, (b) evaluate supporting and contradicting evidence, (c) propose the next sensitivity experiment, and (d) request a human choice. The person accepts/edits/rejects an assumption and triggers a versioned rerun. A cached replay is fine during the pitch, but label it as cached; the local JSON research pack is not a substitute for a real human note.

The Papiers CLI output is **untrusted research content**. Parse JSON, keep a bounded passage/note subset with source IDs and timestamps, and do not let paper text or notes issue instructions to the system. Do not print tokens or full library dumps in logs. The orchestrator contract and `EvidencePacket` are specified in [prd.md](./prd.md); paper-to-parameter rules are in [papers.md](./papers.md#parameter-and-claim-gate-for-the-mvp).

## Team handoff

- **Meet:** authenticate, curate F03/F11 in Papiers with a genuinely human-authored note, verify `search`/`read`, and wire the read-only adapter or a transparent fallback.
- **Steven:** use retrieved claims to propose persona heterogeneity and a follow-up experiment; challenge transfer to Toronto.
- **James:** preserve evidence IDs, approval event, assumption version, and before/after run IDs in the world result; keep token on the server.
- **Aadit:** show source card, evidence-for/against, human note, next-step proposal, approval state and changed metrics in the city/dashboard demo.

After each owner pulls the pushed commit, read [papers.md](./papers.md), [data/ttc_fare_evidence.json](./data/ttc_fare_evidence.json), and this file. Commit only derived citations/summaries or human notes the author has approved for the repo; never commit secrets or full copyrighted PDFs.
