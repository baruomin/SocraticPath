import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getScenario, scenarios } from "../src/scenarios.js";
import {
  containsForbiddenAnswer,
  enforceNoPrematureAnswer,
  evaluateTurn,
  initialTutorState
} from "../src/policy.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "evaluation");

function evaluateCase(definition) {
  const scenario = getScenario(definition.scenarioId);
  let state = initialTutorState();
  let outcome = null;

  for (const message of definition.messages) {
    outcome = evaluateTurn({ message, scenario, state });
    state = outcome.state;
  }

  const actual = {
    intent: outcome.intent,
    status: state.status,
    supportLevel: state.supportLevel,
    attempts: state.attempts,
    duplicateAttempts: state.duplicateAttempts,
    misconceptionId: state.detectedMisconception?.id ?? null,
    directAnswerWithheld: state.directAnswerWithheld,
    responseContainsForbiddenAnswer: containsForbiddenAnswer(outcome.reply, scenario),
    hasNumericProgress: Object.hasOwn(outcome.trace, "progress")
  };

  const mismatches = Object.entries(definition.expected)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);

  return {
    id: definition.id,
    scenarioId: definition.scenarioId,
    messages: definition.messages,
    expected: definition.expected,
    actual,
    passed: mismatches.length === 0,
    mismatches
  };
}

const cases = [
  {
    id: "bare-result-diagnosed-without-escalation",
    scenarioId: "makerspace-plans",
    messages: ["w = 60"],
    expected: { intent: "misconception", status: "working", supportLevel: 0, attempts: 0, misconceptionId: "reported-cost-not-input", directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "garden-area-misconception",
    scenarioId: "garden-design",
    messages: ["I used area, so w(2w + 3) = 54."],
    expected: { intent: "misconception", status: "working", supportLevel: 1, attempts: 1, misconceptionId: "used-area-formula", directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "ticket-average-misconception",
    scenarioId: "ticket-mix",
    messages: ["I divided 365 / 40 and got 9.125 tickets for each type."],
    expected: { intent: "misconception", status: "working", supportLevel: 1, attempts: 1, misconceptionId: "used-average-as-count", directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "unsupported-wrong-answers-do-not-climb",
    scenarioId: "makerspace-plans",
    messages: ["w = 2", "w = 4", "w = 8", "w = 10"],
    expected: { intent: "minimal_attempt", status: "working", supportLevel: 0, attempts: 0, misconceptionId: null, directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "duplicate-reasoning-does-not-climb",
    scenarioId: "makerspace-plans",
    messages: ["I modeled Plan A as 18 + 7w and Plan B as 42 + 3w.", "I modeled Plan A as 18 + 7w and Plan B as 42 + 3w."],
    expected: { intent: "duplicate_attempt", status: "working", supportLevel: 1, attempts: 1, duplicateAttempts: 1, misconceptionId: null, directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "repeated-hint-clicks-are-evidence-gated",
    scenarioId: "garden-design",
    messages: ["I need a hint.", "I am still stuck. Give me another hint."],
    expected: { intent: "hint_request_held", status: "working", supportLevel: 1, attempts: 0, misconceptionId: null, directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "repeated-answer-requests-are-evidence-gated",
    scenarioId: "ticket-mix",
    messages: ["Just tell me the answer.", "Show me the solution.", "Just give me the answer."],
    expected: { intent: "answer_request_redirect", status: "working", supportLevel: 1, attempts: 0, misconceptionId: null, directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "meaningful-use-unlocks-each-level",
    scenarioId: "makerspace-plans",
    messages: ["I modeled Plan A as 18 + 7w and Plan B as 42 + 3w because w is workshops.", "The costs must be equal, so 18 + 7w = 42 + 3w.", "I subtract 3w and 18 from both sides, which gives 4w = 24.", "I divided 24 by 4 but got 8 workshops, so I may have calculated it wrong."],
    expected: { intent: "incorrect", status: "working", supportLevel: 4, attempts: 4, misconceptionId: null, directAnswerWithheld: false, responseContainsForbiddenAnswer: true, hasNumericProgress: false }
  },
  {
    id: "correct-result-needs-explanation",
    scenarioId: "garden-design",
    messages: ["width = 8 m and length = 19 m"],
    expected: { intent: "correct", status: "awaiting_explanation", supportLevel: 0, attempts: 0, misconceptionId: null, directAnswerWithheld: false, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "complete-learning-cycle",
    scenarioId: "ticket-mix",
    messages: ["17 adult tickets and 23 student tickets", "The count equation totals 40 tickets, and substituting the counts into the revenue equation gives 365, so both constraints are satisfied."],
    expected: { intent: "explanation_complete", status: "complete", supportLevel: 0, attempts: 0, misconceptionId: null, directAnswerWithheld: false, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "shallow-explanation-reprompt",
    scenarioId: "makerspace-plans",
    messages: ["6 workshops", "Because it works."],
    expected: { intent: "explanation_incomplete", status: "awaiting_explanation", supportLevel: 0, attempts: 0, misconceptionId: null, directAnswerWithheld: false, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  },
  {
    id: "empty-turn-is-not-evidence",
    scenarioId: "makerspace-plans",
    messages: ["  "],
    expected: { intent: "empty", status: "working", supportLevel: 0, attempts: 0, misconceptionId: null, directAnswerWithheld: true, responseContainsForbiddenAnswer: false, hasNumericProgress: false }
  }
];

const results = cases.map(evaluateCase);
for (const scenario of scenarios) {
  const blocked = enforceNoPrematureAnswer({
    proposedReply: `The final result is ${scenario.answerLabel}.`,
    fallbackReply: scenario.openingQuestion,
    scenario,
    state: initialTutorState()
  });
  results.push({
    id: `${scenario.id}-live-answer-guard`,
    scenarioId: scenario.id,
    messages: ["Simulated live-model feedback"],
    expected: { blocked: true },
    actual: { blocked: blocked.blocked },
    passed: blocked.blocked,
    mismatches: blocked.blocked ? [] : ["blocked: expected true, got false"]
  });
}

const passed = results.filter((item) => item.passed).length;
const summary = { generatedAt: new Date().toISOString(), prototypeVersion: "1.1.0", total: results.length, passed, failed: results.length - passed, results };
const csvHeaders = ["id", "scenarioId", "passed", "intent", "status", "supportLevel", "attempts", "duplicateAttempts", "misconceptionId", "directAnswerWithheld", "hasNumericProgress"];
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvRows = results.map((item) => csvHeaders.map((header) => csvEscape(item[header] ?? item.actual?.[header] ?? "")).join(","));

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(resolve(outputDir, "results.csv"), `${csvHeaders.map(csvEscape).join(",")}\n${csvRows.join("\n")}\n`);

console.log(`SocraticPath evaluation: ${passed}/${results.length} cases passed.`);
if (passed !== results.length) {
  for (const item of results.filter((entry) => !entry.passed)) console.error(`${item.id}: ${item.mismatches.join("; ")}`);
  process.exitCode = 1;
}
