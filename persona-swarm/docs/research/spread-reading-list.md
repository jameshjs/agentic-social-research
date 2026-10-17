# Reading list: persona answers that are too alike

The failure this list targets: Haiku persona agents spread their answers less than real people do, so right spread keeps falling. They say yes to staples almost every time and caricature party on policy questions.

Every link below was opened and checked on 2026-10-17. Section names and numbers come from the arXiv HTML or the publisher's page. Page numbers are given only where I could see them, and the version in Papiers may paginate differently. The findings are paraphrased, not quoted.

**Scope rule for the loop.** The loop may change only the shared `instructions.md` text or the persona format. Ideas that need a different model, a temperature change, fine-tuning, or an outside sampler are marked **out of scope**.

## Short answer

- Four papers say outright that LLM answers are narrower than people's: Funhouse Mirrors, Bisbee et al., Wang et al., and Meister et al. They agree that the cause is the model's own default pulling every persona toward one typical answer. Telling agents to "act like a real person" does not fix that, which matches rounds 2, 6 and 7.
- The instruction-only levers with evidence behind them:
  1. Present the persona as an **interview transcript** rather than a "you are…" role (Lutz et al., Park et al.).
  2. Tell each agent **where this person sits relative to others**, for example as percentiles (Funhouse Mirrors' persona summary).
  3. **Anchor each answer on the person's own past answers to similar items**, not on their demographics or party (Meister et al.'s few-shot steering, Park et al.).
  4. Ask **specific questions instead of general ones**, which reduces caricature (CoMPosT).
- Raising temperature does not restore realistic spread (Wang et al.), and it is out of scope anyway.

## Already in the library (5 unhighlighted)

| Paper | About spread? | Highlight |
|---|---|---|
| Digital Twins as Funhouse Mirrors | **Yes, the core paper** | Results › Five Key Distortions › §1 Insufficient Individuation, §2 Stereotyping, §5 Hyper-rationality |
| Synthetic Replacements for Human Survey Data? | **Yes** | §2.1 Accuracy of Average and Standard Deviations (Fig. 2, Table 1) and §3.1 Effect of Different Prompts |
| LLM Agents Grounded in Self-Reports | Partly: party caricature, not spread | The bias paragraph (p. 9 of v3) and the ablation paragraph (pp. 7–8 of v3) |
| Twin-2K-500 | Partly: it shows collapse without measuring it | §5.2 Aggregate level |
| Automated Social Science | **No** | Skip for this problem. Its abstract finding is that the model gets the sign of an effect right but not its size, which is a different failure. |

(Out of One, Many and the Anthology of Backstories paper already have Steven's 15 highlights, so they are not repeated here.)

---

## 1. Digital Twins as Funhouse Mirrors: Five Key Distortions (in library)

- **Authors, year:** Tianyi Peng, George Gui, Melanie Brucks, Daniel J. Merlau, Grace Jiarui Fan, … Olivier Toubia (24 authors), 2025, arXiv preprint (v5, April 2026). A news release says it appeared in *Science Advances*, but I could not confirm that.
- **Link:** https://arxiv.org/abs/2509.19088
- **Finding:** These are twins built from the Twin-2K-500 dataset, the same one the loop uses. Their answers had a smaller standard deviation than real people's on 154 of 164 outcomes. A full persona barely moved a twin away from a twin with no persona at all, and full-persona twins landed nearest to demographics-only twins.
- **Highlight:**
  - **§1 Insufficient Individuation:** the 154/164 standard-deviation result and the comparison of persona and no-persona distances. This is our right-spread failure, measured on our own data.
  - **§2 Stereotyping:** full personas were no more accurate than demographics alone, so agents lean on demographic stereotypes. This explains the party caricature.
  - **§5 Hyper-rationality:** twins give normative, "textbook" answers. This plausibly drives the near-100% yes on staples.
  - **SI Appendix G.1:** a shorter "persona summary" with percentile information did about as well as the full persona.
- **Instruction-only idea:** Add a short block to the persona that places the person relative to others, for example "more price-sensitive than about 70% of respondents" or "less trusting than most", computed from their own wave 1–3 answers. This is a persona-format change, so it is in scope.
- **Out of scope:** Appendix G.3 reports that temperature 0 improved accuracy, and G.2 that switching base models did not help.

## 2. Synthetic Replacements for Human Survey Data? The Perils of Large Language Models (in library)

- **Authors, year:** James Bisbee, Joshua D. Clinton, Cassy Dorff, Brenton Kenkel, Jennifer M. Larson, 2024, *Political Analysis* 32(4), 401–416.
- **Link:** https://doi.org/10.1017/pan.2024.5 (publisher page: https://www.cambridge.org/core/product/B92267DC26195C7F36E63EA04A47D2FE)
- **Finding:** ChatGPT personas reproduced the average feeling-thermometer scores well but with much smaller standard deviations than the ANES survey: roughly half (16.1 vs 31.4 in Table 1). Small wording changes moved the whole answer distribution.
- **Highlight:**
  - **§2.1 Accuracy of Average and Standard Deviations (Fig. 2, Table 1):** a correct average can hide collapsed spread. That is exactly why the loop scores right spread separately from accuracy.
  - **§3.1 Effect of Different Prompts:** removing political attributes from the persona changes error most on politically charged targets. The persona's party field is doing heavy lifting on policy items.
- **Instruction-only idea:** Keep party in the persona but lower its weight. Put it after the person's own past answers, and tell agents that party predicts the average voter, not this person. Because answers are sensitive to wording, re-test every instruction change across seeds before believing a spread change.

## 3. LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals (in library)

- **Authors, year:** Joon Sung Park, Carolyn Q. Zou, Jonne Kamphorst, Niles Egan, Aaron Shaw, Benjamin Mako Hill, Carrie Cai, Meredith Ringel Morris, Percy Liang, Robb Willer, Michael S. Bernstein, 2024 (v3, June 2026), arXiv.
- **Link:** https://arxiv.org/abs/2411.10109
- **Finding:** This paper does not measure spread. It finds that agents grounded in a person's own interview or survey answers are less biased by group than demographic-prompted agents. For political ideology on the General Social Survey, the accuracy gap between the best- and worst-served groups fell from 13.75% to 8.60% with interviews, and to 6.22% with surveys.
- **Highlight:**
  - **The bias paragraph under Fig. 3 (p. 9 of v3):** grounding on self-reports reduces ideological stereotyping, which is our party caricature.
  - **The ablation paragraph (pp. 7–8):** agents kept most of their accuracy with 80% of the interview randomly removed, and with the interview replaced by a bullet summary. The content matters more than the length or the person's wording.
- **Instruction-only idea:** Tell agents to reason from the person's specific earlier answers first and from demographics or party only as a tiebreaker. Because summaries worked nearly as well, a compact persona format is fine.

## 4. Twin-2K-500: A dataset for building digital twins of over 2,000 people based on their answers to over 500 questions (in library)

- **Authors, year:** Olivier Toubia, George Z. Gui, Tianyi Peng, Daniel J. Merlau, Ang Li, Haozhe Chen, 2025, arXiv (the Funhouse Mirrors paper cites a *Marketing Science* version).
- **Link:** https://arxiv.org/abs/2505.17479
- **Finding:** The paper never measures dispersion. Its aggregate tests show twins collapsing onto one answer:
  - on some items, every twin gave the same answer (all favourable in the outcome-bias task, all the same choice in the Allais problem);
  - about 4% of twins refused the vaccine, against about 45% of people.
- **Highlight:**
  - **§5.2 Aggregate level, including the demand-curve comparison:** this is our dataset and our price items, and it shows the collapse.
  - **Table 2 in §5.1:** text, JSON and summary persona formats gave similar accuracy, so changing the format alone will not fix spread.
- **Instruction-only idea:** No new lever. Use it as a baseline: if our agents' demand curves are flatter than the people's, this paper shows the authors saw the same.

## 5. Large language models that replace human participants can harmfully misportray and flatten identity groups (new)

- **Authors, year:** Angelina Wang, Jamie Morgenstern, John P. Dickerson, 2024 (v3, February 2025), arXiv. Earlier versions had a different title. I could not confirm the journal version, so cite the arXiv version.
- **Link:** https://arxiv.org/abs/2402.01908
- **Finding:** The study had 3,200 human participants. On every question, and on nearly every measure (including how many of 5 multiple-choice options get used), all four LLMs gave less diverse answers than people did. GPT-4 often used only 3 of the 5 options. Raising temperature to 1.4 made the text incoherent before the multiple-choice spread reached human levels.
- **Highlight:**
  - **§3 "LLMs flatten groups and portray them one-dimensionally":** the multiple-choice result is the right-spread failure.
  - **§3.2 Alternative: Higher Temperatures:** evidence that random noise is not the fix, which backs the "spread without noise" rule.
  - **§2.2 Alternative: Identity-Coded Names:** names instead of explicit labels made portrayals less like an outsider's imitation.
- **Instruction-only idea:** Stop writing "a Republican, 45, female" style labels at the top of the persona, and let identity show through the person's own answers. This is a persona-format change. Names are an option, but they add a new variable, so test them in their own round.
- **Out of scope:** the temperature fix, which the paper itself shows fails.

## 6. The Prompt Makes the Person(a): A Systematic Evaluation of Sociodemographic Persona Prompting for Large Language Models (new)

- **Authors, year:** Marlene Lutz, Indira Sen, Georg Ahnert, Elisa Rogers, Markus Strohmaier, 2025, *Findings of EMNLP 2025*, pp. 23212–23237.
- **Link:** https://arxiv.org/abs/2507.16076 (ACL Anthology: https://aclanthology.org/2025.findings-emnlp.1261/)
- **Finding:** The same demographics framed as an interview ("Interviewer: … Interviewee: …") rather than "You are…" produced:
  - fewer stereotyped self-descriptions;
  - more varied answers within each group;
  - for one model, answer distributions closer to real ones on the OpinionsQA survey benchmark.

  Name-based priming helped in the same way. Smaller models sometimes beat larger ones.
- **Highlight:**
  - **§2.1 Role Adoption Formats:** the exact prompt shapes compared.
  - **§4.2 Strategies for Persona Prompting (Figs. 3, 4b, 6; Table 1):** the evidence that format alone changes stereotyping and spread.
- **Instruction-only idea:** Rewrite the persona block so the agent's past answers appear as an interview transcript (each earlier question followed by the person's answer), and pose the new item as the interviewer's next question. This changes only the format, so it is in scope, and it is the most direct test of the "interview-style conditioning" idea.

## 7. Benchmarking Distributional Alignment of Large Language Models (new)

- **Authors, year:** Nicole Meister, Carlos Guestrin, Tatsunori Hashimoto, 2025, *NAACL 2025*, pp. 24–49.
- **Link:** https://arxiv.org/abs/2411.05403 (ACL Anthology: https://aclanthology.org/2025.naacl-long.2/)
- **Finding:** Models can describe a group's answer distribution more accurately than they can produce it by role-playing members of that group. The authors call this the knowledge-to-simulation gap. Steering with a few of the group's real answers to similar questions beat a persona description for every model except GPT-3.5.
- **Highlight:**
  - **§3.1 Distributional Estimation Method:** the three ways of eliciting a distribution.
  - **§4.2 Implications for Distributional Alignment (Table 1, Fig. 4):** few-shot steering beats persona steering, and verbalized distributions beat sampled answers.
  - **§5.2 Open Problems:** models struggle to sample from a distribution they can describe.
- **Instruction-only idea (in scope):** Few-shot anchoring. In the persona, put the person's own answers to the most similar earlier items right next to the question being asked. For a price item, that means their earlier purchase answers at nearby prices, and the instruction would tell the agent to extrapolate from them.
- **Partly out of scope:** asking each agent to state a probability ("how likely is this person to buy?") and then turning that into yes/no with code would add a sampler. That changes the pipeline, not just the instructions, and it is close to adding noise. Steven should decide whether that counts as allowed.

## 8. CoMPosT: Characterizing and Evaluating Caricature in LLM Simulations (new)

- **Authors, year:** Myra Cheng, Tiziano Piccardi, Diyi Yang, 2023, *EMNLP 2023*, pp. 10853–10875.
- **Link:** https://arxiv.org/abs/2310.11501 (ACL Anthology: https://aclanthology.org/2023.emnlp-main.669/)
- **Finding:** The paper defines caricature as a simulation that both differs from the model's default (individuation) and exaggerates the persona's defining trait. Political-leaning and marginalized personas were the most caricatured. General, uncontroversial topics were caricatured more than specific ones, and caricature dropped as the topic got more specific.
- **Highlight:**
  - **§3.1 Definition of Caricature:** vocabulary for the party problem.
  - **§6.2 Exaggeration scores reveal the personas and topics most susceptible to caricature:** conservative personas rank high, and specific topics reduce caricature.
  - **§7 Recommendations.**
- **Instruction-only idea:** Make each item concrete before the agent answers. Restate the policy or product in specific, everyday terms, such as what it costs this person or what changes for them, so the agent cannot fall back on a party-line stance. If the shared instructions can carry a rewording rule, this is in scope.

---

## Suggested highlight order for Steven

1. Funhouse Mirrors §1, §2 and §5: the diagnosis, on our own dataset.
2. Wang et al. §3 and §3.2: flattening is general, and temperature is not the fix.
3. Lutz et al. §4.2: interview format.
4. Meister et al. §4.2: few-shot anchoring beats persona labels.
5. Park et al. pp. 7–9: self-reports over demographics for ideology.
6. Bisbee §2.1, CoMPosT §6.2, Twin-2K-500 §5.2: supporting evidence.

## Not verified

- Page numbers for every paper except Park et al. (v3 PDF).
- The *Science Advances* status of Funhouse Mirrors and the journal version of Wang et al.
- Whether Steven's Papiers copies are the same versions as the ones checked here.
