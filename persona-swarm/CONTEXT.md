# Persona agent tuning

Making the city's persona agents behave like real people: their shared instructions are tuned, round by round,
against real survey respondents, with humans coaching the process.

## Language

### Real people and their answers

**Respondent**:
A real person in the Twin-2K-500 survey whose answers a persona agent is scored against.
_Avoid_: participant, person (ambiguous with agent), user

**Survey wave**:
One of the four times respondents were surveyed. Waves 1–3 came first; wave 4, months later, repeated some
questions.
_Avoid_: round, first round, second round

**Given answers**:
A respondent's waves 1–3 answers, minus every exam question. This is all a persona agent may read about them.
_Avoid_: persona markdown, first-round data, context

**Exam**:
The wave-4 questions put to a persona agent, without answers.
_Avoid_: test, second round

**Answer sheet**:
A respondent's real wave-4 answers to the exam. Locked away from every agent.
_Avoid_: ground truth, labels

**Consistency key**:
A respondent's waves 1–3 answers to the same questions as the exam. Locked away from every agent, and used only to
measure human consistency.
_Avoid_: retest answers

**Human consistency**:
How often a respondent repeated their own earlier answer on the exam. The level no persona agent is expected to beat.
_Avoid_: test-retest reliability, accuracy ceiling

### The tuning loop

**Persona tuning loop**:
The whole process: ten tuning rounds of prompt tuning against the benchmark, steered by coaches, before the
instructions are used by the city's agents.
_Avoid_: gym, agent gym, training environment

**Tuning record**:
The timestamped account of every tuning round: what changed in the instructions and why, the scorecard before and
after, the decision, and who made it. The improvements are shown from it.
_Avoid_: log, history, run notes

**Persona agent**:
One AI instance that reads one respondent's given answers and answers the exam as them.
_Avoid_: twin, digital twin, subagent

**Instructions**:
The single text every persona agent follows, written the same for every respondent. The only thing the loop changes.
_Avoid_: prompt, system prompt, persona file

**Researcher agent**:
The AI that proposes changes to the instructions, runs tuning rounds, and asks coaches for help.
_Avoid_: orchestrator (that is the world engine), main agent

**Coach**:
A teammate who steers the researcher agent through highlights and notes on papers in Papiers and by approving or
rejecting changes.
_Avoid_: judge, reviewer, user

**Highlight**:
A passage a coach marks in a paper in Papiers. With notes, highlights are how coaches give the researcher agent
research knowledge; every round reads all of them.
_Avoid_: annotation (Papiers' annotated filter doesn't count highlights), quote

**Suggested edit**:
A change to the instructions or the persona format that the researcher agent proposes for the next tuning round,
tied to a round's results and to the highlights or notes behind it. One suggested edit becomes the next round's
change.
_Avoid_: recommendation, proposal (on its own)

**Tuning round**:
One attempt at a single instruction change: run the persona agents, score them, then keep or discard the change.
_Avoid_: iteration, epoch, wave, round (on its own, when a survey wave could be meant)

**Prompt tuning**:
Improving persona agents by changing only their instructions. The model itself is never retrained.
_Avoid_: fine-tuning, training

**Tuning set**, **Check set**, **Final set**:
Three non-overlapping groups of respondents. The researcher agent learns from mistakes on the tuning set, every
change is judged on the check set, and the final set is scored once, at the end.
_Avoid_: train/validation/test

**Persona format**:
How a respondent's given answers are written out for a persona agent: full, compact Q&A, topic profile, interview
(an interviewer-and-me transcript with the options offered), or short card.
_Avoid_: template, rendering

**Tendency**:
One of four broad leanings a persona carries: risk tolerance, price sensitivity, concern for others, and openness to
change. Twin short cards carry all but price sensitivity, which Twin's given answers don't measure.
_Avoid_: trait (the city's persona JSON uses `traits` for scenario facts like car ownership), attribute, personality
score

**Trigger**:
A situation in which the researcher agent must stop and ask a coach before going on.
_Avoid_: alert, escalation

**Sign-off**:
A coach's approval that makes a kept change official. A change without sign-off is still on trial.
_Avoid_: merge, approval (on its own)

### Scoring

**Scorecard**:
The four checks, computed by code, that grade a tuning round: right person, right spread, right group gaps, and
steady.
_Avoid_: judge, evaluation (on its own)

**Right person**:
How often a persona agent gave its respondent's real answer, as a share of that respondent's human consistency.
_Avoid_: accuracy

**Right spread**:
Whether persona agents' answers vary across people as much as respondents' answers do.
_Avoid_: diversity, entropy

**Right group gaps**:
Whether differences between groups of respondents, such as older vs younger, point the same way among their persona
agents.
_Avoid_: subgroup accuracy

**Steady**:
Whether a persona agent gives the same answer when a question is reworded.
_Avoid_: robustness, stability

**Baseline**:
A simple way of answering the exam without a persona agent, which the agents must beat: the most common answer,
rules from demographics, copying the most similar respondent, or an agent given no persona.
_Avoid_: control

**Benchmark**:
The fixed pass marks on the check set that tuning works toward. They are set before the first tuning round and never
moved.
_Avoid_: target, goal score

**Question family**:
A group of exam questions of one kind: policy opinions, pricing, or decision puzzles.
_Avoid_: block, section (Twin's own survey units)

**Held-out family**:
A question family never used in tuning and scored only on the final set, to show the agents learned to read people
rather than question styles.
_Avoid_: unseen data

**Condition**:
One of the randomly assigned versions of a decision puzzle that a respondent saw. For example, the same choice worded
as lives saved or as lives lost.
_Avoid_: variant, arm, treatment

**Experiment effect**:
The difference in answers between two conditions of the same puzzle, measured among respondents and, separately,
among their persona agents.
_Avoid_: treatment effect, framing effect (one kind of experiment effect)
