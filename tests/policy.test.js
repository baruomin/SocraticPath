import test from "node:test";
import assert from "node:assert/strict";
import { getScenario } from "../src/scenarios.js";
import {
  initialTutorState,
  evaluateTurn,
  containsForbiddenAnswer,
  enforceNoPrematureAnswer
} from "../src/policy.js";

const scenario = getScenario("makerspace-plans");

function turn(state, message, analysis = null, selectedScenario = scenario) {
  return evaluateTurn({ state, message, scenario: selectedScenario, analysis });
}

function liveAnalysis(overrides = {}) {
  return {
    source: "live",
    intent: "attempt",
    correctness: "incorrect",
    effort: "substantive",
    usesCurrentSupport: false,
    misconceptionId: null,
    explanationSufficient: false,
    feedback: "This is a personalized diagnostic.",
    summary: "The learner showed a reasoned step.",
    ...overrides
  };
}

test("a bare wrong answer may be diagnosed but does not unlock stronger support", () => {
  const outcome = turn(initialTutorState(), "w = 60");
  assert.equal(outcome.state.attempts, 0);
  assert.equal(outcome.state.supportLevel, 0);
  assert.equal(outcome.state.detectedMisconception.id, "reported-cost-not-input");
  assert.match(outcome.reply, /question asks for the number of workshops/i);
  assert.equal(outcome.trace.directAnswerWithheld, true);
});

test("different unsupported wrong answers cannot climb the ladder", () => {
  let state = initialTutorState();
  for (const answer of ["w = 2", "w = 4", "w = 8", "w = 10", "w = 12"]) state = turn(state, answer).state;
  assert.equal(state.attempts, 0);
  assert.equal(state.supportLevel, 0);
  assert.equal(state.directAnswerWithheld, true);
});

test("a substantive first step advances from diagnosis to a concept connection", () => {
  const outcome = turn(initialTutorState(), "I modeled Plan A as 18 + 7w and Plan B as 42 + 3w because w is the workshop count.");
  assert.equal(outcome.state.attempts, 1);
  assert.equal(outcome.state.supportLevel, 1);
  assert.match(outcome.reply, /break-even point/i);
  assert.match(outcome.trace.evidence, /distinct reasoning step/i);
});

test("repeating a substantive attempt does not count twice", () => {
  const message = "I modeled Plan A as 18 + 7w and Plan B as 42 + 3w.";
  const first = turn(initialTutorState(), message);
  const duplicate = turn(first.state, message);
  assert.equal(duplicate.intent, "duplicate_attempt");
  assert.equal(duplicate.state.attempts, 1);
  assert.equal(duplicate.state.duplicateAttempts, 1);
  assert.equal(duplicate.state.supportLevel, 1);
});

test("one initial hint is available, but repeated hint clicks do not climb the ladder", () => {
  const first = turn(initialTutorState(), "I need a hint.");
  const second = turn(first.state, "I am still stuck. Can I get another hint?");
  assert.equal(first.state.supportLevel, 1);
  assert.equal(second.intent, "hint_request_held");
  assert.equal(second.state.supportLevel, 1);
  assert.match(second.reply, /show how you tried this level/i);
});

test("a new attempt at the current level can authorize a stronger requested hint", () => {
  const firstHint = turn(initialTutorState(), "I need a hint.");
  const attempt = turn(firstHint.state, "I tried subtracting the monthly fees, but I am not sure how that changes the workshop terms.");
  const moreHelp = turn(attempt.state, "I am still stuck and need more help.");
  assert.equal(attempt.state.attemptedAtCurrentLevel, true);
  assert.equal(attempt.state.supportLevel, 1);
  assert.equal(moreHelp.state.supportLevel, 2);
  assert.match(moreHelp.trace.evidence, /meaningful attempt at the prior level/i);
});

test("using each support level unlocks the next level in sequence", () => {
  let state = initialTutorState();
  state = turn(state, "I modeled Plan A as 18 + 7w and Plan B as 42 + 3w because w is workshops.").state;
  assert.equal(state.supportLevel, 1);
  state = turn(state, "The costs must be equal, so 18 + 7w = 42 + 3w.").state;
  assert.equal(state.supportLevel, 2);
  state = turn(state, "I subtract 3w and 18 from both sides, which gives 4w = 24.").state;
  assert.equal(state.supportLevel, 3);
  state = turn(state, "I divided 24 by 4 but got 8 workshops, so I may have calculated it wrong.").state;
  assert.equal(state.supportLevel, 4);
  assert.equal(state.attempts, 4);
  assert.equal(state.directAnswerWithheld, false);
});

test("LLM interpretation can recognize free-form use of the current support", () => {
  const conceptState = { ...initialTutorState(), supportLevel: 1 };
  const outcome = turn(conceptState, "The starting amounts matter as well as what changes each time.", liveAnalysis({ usesCurrentSupport: true }));
  assert.equal(outcome.state.supportLevel, 2);
  assert.equal(outcome.trace.analysisSource, "live");
  assert.match(outcome.reply, /personalized diagnostic/i);
});

test("direct-answer requests cannot climb without learner evidence", () => {
  let state = initialTutorState();
  for (let request = 0; request < 8; request += 1) state = turn(state, "Just tell me the answer.").state;
  assert.equal(state.supportLevel, 1);
  assert.equal(state.attempts, 0);
  assert.equal(state.directAnswerWithheld, true);
});

test("an answer request at maximum support never downgrades the ladder", () => {
  const state = { ...initialTutorState(), supportLevel: 4, directAnswerWithheld: false };
  const outcome = turn(state, "Please show me the solution.");
  assert.equal(outcome.state.supportLevel, 4);
  assert.equal(outcome.state.directAnswerWithheld, false);
  assert.match(outcome.reply, /w = 6 workshops/i);
});

test("a correct answer transitions to self-explanation without a percentage score", () => {
  const outcome = turn(initialTutorState(), "The plans match at 6 workshops.");
  assert.equal(outcome.intent, "correct");
  assert.equal(outcome.state.status, "awaiting_explanation");
  assert.equal(outcome.state.directAnswerWithheld, false);
  assert.equal("progress" in outcome.trace, false);
  assert.match(outcome.trace.nextEscalationTrigger, /why does setting/i);
});

test("a substantive self-explanation completes the learning cycle", () => {
  const correct = turn(initialTutorState(), "6 workshops");
  const explanation = turn(correct.state, "I set the costs equal because break-even means both plans cost the same, then substituted the workshop count into both expressions to check.");
  assert.equal(explanation.intent, "explanation_complete");
  assert.equal(explanation.state.status, "complete");
  assert.equal("progress" in explanation.trace, false);
});

test("a shallow self-explanation is prompted for deeper reasoning", () => {
  const correct = turn(initialTutorState(), "6 workshops");
  const explanation = turn(correct.state, "Because it works.");
  assert.equal(explanation.intent, "explanation_incomplete");
  assert.equal(explanation.state.status, "awaiting_explanation");
});

test("live analysis can recognize a correct paraphrase outside authored answer patterns", () => {
  const outcome = turn(initialTutorState(), "My result is the workshop count where both totals meet.", liveAnalysis({ correctness: "correct", feedback: "Both modeled costs agree at the stated point." }));
  assert.equal(outcome.intent, "correct");
  assert.equal(outcome.state.status, "awaiting_explanation");
});

test("off-topic turns do not count as evidence or alter support", () => {
  const outcome = turn(initialTutorState(), "What is the weather today?", liveAnalysis({ intent: "off_topic", correctness: "not_applicable", effort: "none" }));
  assert.equal(outcome.intent, "off_topic");
  assert.equal(outcome.state.attempts, 0);
  assert.equal(outcome.state.supportLevel, 0);
});

test("premature answer content in live feedback is blocked", () => {
  const outcome = turn(initialTutorState(), "I started by comparing the two monthly fees and workshop rates.", liveAnalysis({ feedback: "The final answer is 6 workshops." }));
  assert.equal(outcome.trace.modelFeedbackBlocked, true);
  assert.equal(containsForbiddenAnswer(outcome.reply, scenario), false);
});

test("the guard permits final-answer language after worked support is authorized", () => {
  const state = { ...initialTutorState(), supportLevel: 4, directAnswerWithheld: false };
  const checked = enforceNoPrematureAnswer({ proposedReply: "The break-even point is w = 6 workshops.", fallbackReply: "Fallback", scenario, state });
  assert.equal(checked.blocked, false);
  assert.match(checked.reply, /w = 6 workshops/i);
});

test("all authored scenarios recognize a representative misconception", () => {
  const examples = [
    ["makerspace-plans", "I only need to compare the rates, so 7 = 3.", "compared-rates-only"],
    ["garden-design", "I used area, so w(2w + 3) = 54.", "used-area-formula"],
    ["ticket-mix", "I divided total revenue by total tickets: 365 / 40 = 9.125 tickets.", "used-average-as-count"]
  ];
  for (const [scenarioId, message, expectedId] of examples) {
    const selected = getScenario(scenarioId);
    const outcome = turn(initialTutorState(), message, null, selected);
    assert.equal(outcome.state.detectedMisconception.id, expectedId);
  }
});

test("correct complete answers for every scenario trigger self-explanation", () => {
  const answers = [
    ["makerspace-plans", "6 workshops"],
    ["garden-design", "width = 8 m and length = 19 m"],
    ["ticket-mix", "17 adult tickets and 23 student tickets"]
  ];
  for (const [scenarioId, message] of answers) {
    const selected = getScenario(scenarioId);
    const outcome = turn(initialTutorState(), message, null, selected);
    assert.equal(outcome.intent, "correct");
    assert.equal(outcome.state.status, "awaiting_explanation");
    assert.equal("progress" in outcome.trace, false);
  }
});

test("empty input does not count as evidence", () => {
  const outcome = turn(initialTutorState(), "   ");
  assert.equal(outcome.intent, "empty");
  assert.equal(outcome.state.attempts, 0);
  assert.equal(outcome.state.supportLevel, 0);
});
