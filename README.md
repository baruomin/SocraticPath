# SocraticPath

SocraticPath is a proof-of-concept tutoring interaction system for productive struggle in introductory algebra. It interprets a learner's reasoning, exposes a transparent five-level support policy, withholds premature answers, and asks the learner to explain a successful solution.

The prototype was created for the development track of Georgia Tech CS6460: Educational Technology.

## What changed in version 1.1

- Escalation is **evidence-gated**, not driven by a count of wrong answers.
- Bare answers and repeated submissions do not unlock stronger support.
- Repeated hint clicks or answer requests cannot climb the ladder without an intervening attempt.
- The interface states exactly what evidence can unlock the next level.
- Numeric “learning progress” percentages were removed because the prototype does not estimate mastery.
- The three short equation drills were replaced with applied modeling tasks.
- Live mode now uses structured LLM analysis to interpret free-form reasoning, correctness, effort, use of the current hint, and authored misconceptions.

## Three applied scenarios

| Scenario | Main reasoning demonstrated |
|---|---|
| Compare Makerspace Plans | Build two cost functions and interpret a break-even point |
| Design a Community Garden | Translate a perimeter constraint, distribute, and recover two dimensions |
| Reconstruct Ticket Sales | Use two equations and substitution to satisfy count and revenue constraints |

## Evidence-gated support ladder

1. **Diagnostic question** — elicit the learner's model, equation, or plan.
2. **Concept connection** — available after a substantive first step, or as the first requested hint.
3. **Strategy cue** — available after the learner tries the concept-level support, or makes a genuine attempt and then asks for more help.
4. **Worked next step** — available after the learner engages with the strategy cue.
5. **Worked explanation** — available only after the learner attempts the partial worked step and remains stuck.

A substantive attempt must show an operation, equation, model, or explanation. A lone answer such as `w = 4`, a duplicate response, a hint request, or “just tell me” does not count as learner evidence.

## Other implemented behavior

- Known-misconception feedback for each scenario
- A self-explanation stage after a correct result
- Instructor-facing trace of meaningful attempts, duplicates, detected patterns, active support, policy decisions, and the next escalation trigger
- Downloadable JSON traces for session-level inspection
- Deterministic rule fallback for presentations or offline use
- Optional Live LLM interpretation through the OpenAI Responses API
- A scenario-specific answer guard that removes premature answer content from model feedback

## Requirements

- Node.js 20 or newer
- No third-party packages
- An OpenAI API key for Live LLM mode; the rule fallback works without one

## Run locally

From this directory:

```bash
npm start
```

Then open <http://127.0.0.1:4173>.

Run the automated tests:

```bash
npm test
```

Generate the scripted evaluation matrix:

```bash
npm run evaluate
```

The evaluation command writes `evaluation/results.json` and `evaluation/results.csv`.

## Live LLM mode

Copy `.env.example` to `.env` and provide your own API key:

```text
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
```

Restart the server. When a key is present, new sessions default to **Live LLM**; **Demo** remains available as an explicit fallback. On each turn, the model returns a structured analysis of the learner's intent, correctness, effort, use of the current support, and misconception evidence. The application then applies the deterministic policy. The model does not authorize escalation or final-answer release.

API requests use `store: false`. If live interpretation fails, the current turn uses the rule fallback. Do not commit `.env` or include it in a submission archive.

## Suggested demonstration

Choose **Compare Makerspace Plans**. Live mode makes the feedback more flexible; Demo mode produces the same policy transitions deterministically.

1. Enter `w = 60`. The tutor recognizes a relevant error but keeps Level 1 because a result alone is not evidence of reasoning.
2. Enter `I modeled Plan A as 18 + 7w and Plan B as 42 + 3w because w is workshops.` The substantive model unlocks Level 2.
3. Enter `The costs must be equal, so 18 + 7w = 42 + 3w.` Using the concept connection unlocks Level 3.
4. Enter `I subtract 3w and 18 from both sides, which gives 4w = 24.` Using the strategy unlocks Level 4.
5. Enter `I divided 24 by 4 but got 8 workshops, so I may have calculated it wrong.` The attempt at the partial step confirms an impasse and unlocks Level 5.
6. Enter `6 workshops`, then explain why equal costs define break-even and verify both plan totals.

For a second quick demonstration, reset the problem and click **Ask for a hint** twice. The first request opens Level 2; the second stays at Level 2 until the learner attempts that support.

## Project structure

```text
productive-struggle-tutor/
├── public/                 Browser interface
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── scenarios.js       Applied tasks, misconception library, and support content
│   ├── policy.js          Evidence-gated tutoring state machine and answer guard
│   └── openai-client.js   Structured Responses API interpretation
├── tests/
│   ├── policy.test.js
│   └── server.test.js
├── scripts/
│   └── run-evaluation.mjs
├── docs/
│   └── design.md
├── server.js              Local HTTP server and session API
└── package.json
```

## Scope and limitations

This is an interaction proof of concept, not a complete educational platform. It does not include accounts, persistent learner models, a teacher dashboard, or a broad curriculum. The authored misconception library is small, and automated tests establish software behavior rather than learning effectiveness. Live interpretation can still make classification mistakes; policy constraints and the rule fallback limit their impact.

## AI assistance disclosure

ChatGPT/Codex assisted with implementation, testing, interface refinement, and technical documentation. The project owner reviewed the artifacts and remains responsible for the submitted work. No API key or private learner data is included in the archive.
