---
status: accepted
---

# Benchmark persona agents on Twin-2K-500 `wave_split`, and tune only their instructions

Persona agents are scored against real respondents from Twin-2K-500's `wave_split` configuration, whose given
answers leave out every exam question. We never use `full_persona` or its `persona_summary`: for questions asked
twice, they substitute the wave-4 answers, which would hand the agents the answer sheet. Agents improve only through
changes to their shared instructions and persona format. The model is never retrained, so every result can be
rerun, a round stays cheap, and nothing we show claims the model learned from the data.

## Considered options

- **Fidelity checks on synthetic Nemotron personas only.** Rejected: they show agents follow a sheet, but nothing
  real stands behind the sheet to say whether they act like people.
- **An AI judge rating answers as human-like.** Rejected: a model's opinion, which is exactly what we are trying to
  measure against reality.
- **Fine-tuning a model on survey answers.** Rejected: it needs training infrastructure we don't have, and the PRD
  warns against claiming that anything trains the model.
