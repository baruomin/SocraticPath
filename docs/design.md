# SocraticPath Design Notes

## Design goal

The prototype tests a focused interaction hypothesis: an LLM-based learning assistant can behave more like a coach than a solution provider when language understanding is constrained by an explicit, inspectable support policy.

The implementation separates three concerns:

1. **Interpretation** identifies what evidence the learner's message contains.
2. **Pedagogical policy** decides whether stronger support is authorized.
3. **Response content** delivers only the support allowed at that level.

## Architecture

```text
Student message
      |
      +----> Live: structured LLM interpretation
      |             or
      +----> Demo/failure: rule interpretation
                        |
                        v
        Evidence-gated policy/state machine
                        |
                        v
          Authored level-appropriate support
                        |
                        v
              Scenario answer guard
                        |
                        v
              Tutor response + trace
```

The browser communicates with a small local Node.js server. Session state is held in memory. Scenario definitions are separate from the policy engine so that tasks, evidence patterns, misconceptions, and support sequences can be revised without changing the state-machine rules.

## Why attempt count was replaced

The earlier prototype advanced after a fixed number of incorrect submissions. That made a weak assumption: five wrong numbers were treated as equivalent to sustained productive effort. It also allowed a learner to reach full worked support without engaging with any hint.

Version 1.1 treats attempt count as descriptive only. Escalation depends on evidence:

- a response must contain a mathematical step, model, equation, or explanation;
- exact duplicate submissions are ignored;
- after the first hint, another request alone does not escalate;
- the learner must engage with the current support, or make a genuine attempt before explicitly requesting more help;
- the worked explanation is available only after evidence at the worked-next-step level.

## State model

Each session records:

- `status`: working, awaiting self-explanation, or complete;
- `attempts`: distinct substantive unsuccessful attempts;
- `duplicateAttempts`: repeated submissions ignored for escalation;
- `supportLevel`: an integer from 0 through 4;
- `attemptedAtCurrentLevel`: whether a meaningful attempt followed the current support;
- `seenAttemptFingerprints`: normalized prior attempts for duplicate detection;
- `detectedMisconception`: the most recently matched authored error pattern;
- `analysisSource`: live LLM interpretation or rule fallback;
- `turnCount`: all learner messages;
- `directAnswerWithheld`: whether the answer guard is active;
- `lastDecision`, `lastEvidence`, and `nextEscalationTrigger`: inspectable policy explanations.

## Escalation policy

| Level | Support type | Evidence that authorizes it |
|---:|---|---|
| 0 | Diagnostic question | Initial state |
| 1 | Concept connection | A substantive first step, or the first explicit hint request |
| 2 | Strategy cue | An attempt that uses Level 1, or an attempt at Level 1 followed by a request for more help |
| 3 | Worked next step | An attempt that uses Level 2, or an attempt at Level 2 followed by a request for more help |
| 4 | Worked explanation | An attempt that uses Level 3, or an attempt at Level 3 followed by a request for more help |

Bare answers, empty messages, off-topic turns, duplicates, and repeated requests without intervening effort keep the current level unchanged. The policy is monotonic: no action can reduce the support level.

## Live interpretation

Live mode sends the current problem, active support, authored misconception IDs, recent conversation, and latest message to the OpenAI Responses API. Structured output supplies:

- intent;
- correctness;
- effort quality;
- whether the learner used the current support;
- an authored misconception ID or null;
- self-explanation sufficiency;
- a concise diagnostic feedback sentence;
- an instructor-facing evidence summary.

The application validates this structure and then applies the same policy used in Demo mode. If the API fails or returns unusable output, the turn falls back to deterministic rules. API output can inform classification but cannot directly set `supportLevel`.

## Productive-struggle guardrails

1. A correct result leads to self-explanation rather than immediate completion.
2. A direct request for the solution receives only currently authorized support.
3. Repeated requests do not substitute for learner effort.
4. The system does not withhold indefinitely: genuine engagement at each level reaches a worked explanation.
5. Scenario-specific answer patterns scan personalized model feedback. Premature disclosure is replaced with the authored policy-safe response.
6. The instructor trace shows why the level changed and what can unlock the next level.

## Current evaluation approach

Automated tests and scripted cases verify software behavior rather than learning gains. They check that:

- bare and repeated wrong answers do not escalate;
- duplicate substantive attempts count once;
- repeated hint and answer requests are evidence-gated;
- meaningful use of each support level advances monotonically;
- known misconceptions receive targeted feedback;
- correct results lead to self-explanation;
- substantive explanation completes the cycle;
- numeric mastery/progress is absent;
- premature live-model answer content is blocked;
- all three applied scenarios work through the server API.

## Claims the prototype does not make

- It has not demonstrated improved learning outcomes with human participants.
- It does not estimate mastery, emotion, confidence, or frustration.
- Its authored misconception library and rule fallback are intentionally constrained.
- Live model interpretation can misclassify a turn even when the output schema is valid.
- Three applied tasks demonstrate an interaction design; they do not constitute a full algebra curriculum.
