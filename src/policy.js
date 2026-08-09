const MAX_SUPPORT_LEVEL = 4;

export const SUPPORT_LABELS = [
  "Diagnostic question",
  "Concept connection",
  "Strategy cue",
  "Worked next step",
  "Worked explanation"
];

const VALID_INTENTS = new Set([
  "attempt",
  "hint_request",
  "answer_request",
  "off_topic",
  "unclear",
  "self_explanation"
]);
const VALID_CORRECTNESS = new Set(["correct", "partially_correct", "incorrect", "not_applicable"]);
const VALID_EFFORT = new Set(["substantive", "minimal", "none"]);

export function initialTutorState() {
  return {
    status: "working",
    attempts: 0,
    duplicateAttempts: 0,
    supportLevel: 0,
    turnCount: 0,
    detectedMisconception: null,
    attemptedAtCurrentLevel: false,
    seenAttemptFingerprints: [],
    lastDecision: "Opened with a diagnostic question",
    lastEvidence: "No learner evidence yet",
    analysisSource: "rules",
    modelFeedbackBlocked: false,
    directAnswerWithheld: true
  };
}

function normalized(message) {
  return message.toLowerCase().replace(/[,$]/g, "").replace(/\s+/g, " ").trim();
}

function matchesAny(message, patterns = []) {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(message));
}

export function isCorrectAnswer(message, scenario) {
  return matchesAny(normalized(message), scenario.answerPatterns);
}

export function detectMisconception(message, scenario) {
  const text = normalized(message);
  return scenario.misconceptions.find((item) => matchesAny(text, item.patterns)) ?? null;
}

export function containsForbiddenAnswer(message, scenario) {
  return matchesAny(normalized(message), scenario.forbiddenAnswerPatterns);
}

function requestsHint(message) {
  return /\b(hint|help|stuck|nudge|clue|more support|what next)\b|提示|不会|不知道|卡住/i.test(message);
}

function requestsAnswer(message) {
  return /\b(give|tell|show)\b.{0,20}\b(answer|solution)\b|just.{0,12}\banswer\b|what(?:'s| is)\s+the\s+(?:answer|solution)|直接.{0,8}(答案|解答)|告诉我答案/i.test(
    message
  );
}

function explanationQuality(message, scenario, turnAnalysis) {
  const text = normalized(message);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const conceptHits = scenario.explanationKeywords.filter((keyword) =>
    text.includes(keyword.toLowerCase())
  ).length;
  return {
    sufficient:
      turnAnalysis.explanationSufficient ||
      wordCount >= 14 ||
      (wordCount >= 8 && conceptHits >= 2) ||
      (text.length >= 55 && conceptHits >= 1),
    wordCount,
    conceptHits
  };
}

function heuristicEffort(message) {
  const text = normalized(message);
  const words = text.split(/\s+/).filter(Boolean);
  const numbers = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const hasReasoningLanguage =
    /\b(because|first|then|so|therefore|represent|equation|equal|substitut|distribut|subtract|add|divide|multiply|combine|perimeter|revenue|cost|fixed|variable|check)\w*\b/i.test(
      text
    );
  const hasMultiTermMath =
    numbers.length >= 2 &&
    (/[a-z]\s*[+\-*/]/i.test(text) || /[+\-*/]\s*[a-z]/i.test(text) || /[+*/()]|\s-\s/.test(text));
  const hasEquationWork = /=/.test(text) && (hasMultiTermMath || numbers.length >= 2 || words.length >= 6);

  if (hasEquationWork || (words.length >= 5 && hasReasoningLanguage) || (words.length >= 8 && text.length >= 35)) {
    return "substantive";
  }
  if (text) return "minimal";
  return "none";
}

function authoredEvidenceUsed(message, scenario, supportLevel) {
  if (supportLevel === 0) return true;
  return matchesAny(normalized(message), scenario.evidencePatterns?.[supportLevel] ?? []);
}

function findAuthoredMisconception(id, scenario) {
  if (!id) return null;
  return scenario.misconceptions.find((item) => item.id === id) ?? null;
}

function trimFeedback(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 320);
}

function analyzeTurn(message, scenario, state, externalAnalysis) {
  const explicitAnswerRequest = requestsAnswer(message);
  const explicitHintRequest = !explicitAnswerRequest && requestsHint(message);
  const ruleCorrect = isCorrectAnswer(message, scenario);
  const ruleMisconception = detectMisconception(message, scenario);
  const live = externalAnalysis?.source === "live";

  let intent = live && VALID_INTENTS.has(externalAnalysis.intent) ? externalAnalysis.intent : "attempt";
  if (state.status === "awaiting_explanation") intent = "self_explanation";
  else if (explicitAnswerRequest) intent = "answer_request";
  else if (explicitHintRequest) intent = "hint_request";

  let correctness =
    live && VALID_CORRECTNESS.has(externalAnalysis.correctness)
      ? externalAnalysis.correctness
      : ruleCorrect
        ? "correct"
        : "incorrect";
  if (ruleCorrect) correctness = "correct";

  let effort =
    live && VALID_EFFORT.has(externalAnalysis.effort)
      ? externalAnalysis.effort
      : heuristicEffort(message);
  if (["hint_request", "answer_request", "off_topic", "unclear"].includes(intent)) {
    effort = "none";
  }

  const misconception =
    ruleMisconception || (live ? findAuthoredMisconception(externalAnalysis.misconceptionId, scenario) : null);
  const usesCurrentSupport =
    effort === "substantive" &&
    (authoredEvidenceUsed(message, scenario, state.supportLevel) ||
      (live && externalAnalysis.usesCurrentSupport === true));

  return {
    source: live ? "live" : "rules",
    intent,
    correctness,
    effort,
    usesCurrentSupport,
    misconception,
    explanationSufficient: live && externalAnalysis.explanationSufficient === true,
    feedback: live ? trimFeedback(externalAnalysis.feedback) : "",
    summary: live ? trimFeedback(externalAnalysis.summary) : "Rule-based interpretation"
  };
}

function nextEscalationTrigger(state, scenario) {
  if (state.status === "complete") {
    return "Learning cycle complete; choose another scenario or reset this one.";
  }
  if (state.status === "awaiting_explanation") {
    return scenario.selfExplanationPrompt;
  }
  if (state.supportLevel === 0) {
    return "Submit a reasoned first step, or ask once for a conceptual hint.";
  }
  if (state.supportLevel >= MAX_SUPPORT_LEVEL) {
    return "Use the worked explanation to check both constraints, then explain why the method works.";
  }
  if (state.attemptedAtCurrentLevel) {
    return `You have tried at this level. Revise using the current support, or ask for stronger help.`;
  }
  return scenario.engagementPrompts[state.supportLevel];
}

function traceFrom(state, scenario) {
  const level = Math.max(0, Math.min(MAX_SUPPORT_LEVEL, state.supportLevel));
  return {
    status: state.status,
    attempts: state.attempts,
    duplicateAttempts: state.duplicateAttempts,
    turnCount: state.turnCount,
    supportLevel: level,
    supportLabel: SUPPORT_LABELS[level],
    detectedMisconception: state.detectedMisconception?.label ?? "None yet",
    policyDecision: state.lastDecision,
    evidence: state.lastEvidence,
    attemptedAtCurrentLevel: state.attemptedAtCurrentLevel,
    nextEscalationTrigger: nextEscalationTrigger(state, scenario),
    analysisSource: state.analysisSource,
    modelFeedbackBlocked: state.modelFeedbackBlocked,
    directAnswerWithheld: state.directAnswerWithheld,
    learningGoal: scenario.objective
  };
}

function withModelFeedback(turnAnalysis, safeReply) {
  if (!turnAnalysis.feedback) return safeReply;
  return `${turnAnalysis.feedback} ${safeReply}`.replace(/\s+/g, " ").trim();
}

function result(state, scenario, safeReply, intent, turnAnalysis) {
  const proposedReply = withModelFeedback(turnAnalysis, safeReply);
  const guarded = enforceNoPrematureAnswer({
    proposedReply,
    fallbackReply: safeReply,
    scenario,
    state
  });
  state.modelFeedbackBlocked = guarded.blocked;
  return {
    state,
    reply: guarded.reply,
    safeReply,
    intent,
    trace: traceFrom(state, scenario)
  };
}

function addFingerprint(state, fingerprint) {
  if (!fingerprint || state.seenAttemptFingerprints.includes(fingerprint)) return;
  state.seenAttemptFingerprints = [...state.seenAttemptFingerprints, fingerprint].slice(-24);
}

function requestSupport({ next, scenario, turnAnalysis, kind }) {
  const isAnswerRequest = kind === "answer";
  const canAdvance =
    next.supportLevel < MAX_SUPPORT_LEVEL &&
    (next.supportLevel === 0 || next.attemptedAtCurrentLevel);

  if (canAdvance) {
    next.supportLevel += 1;
    next.attemptedAtCurrentLevel = false;
    next.directAnswerWithheld = next.supportLevel < MAX_SUPPORT_LEVEL;
    next.lastDecision = isAnswerRequest
      ? `Redirected an answer request to ${SUPPORT_LABELS[next.supportLevel].toLowerCase()} after learner evidence`
      : `Advanced to ${SUPPORT_LABELS[next.supportLevel].toLowerCase()} after learner evidence`;
    next.lastEvidence =
      next.supportLevel === 1
        ? "The learner explicitly requested initial support"
        : "The learner made a meaningful attempt at the prior level before requesting more support";
    const hint = scenario.hints[next.supportLevel];
    const safeReply = isAnswerRequest
      ? `I will increase support without skipping the reasoning. ${hint.prompt}`
      : `Here is the next level of support: ${hint.prompt}`;
    return result(
      next,
      scenario,
      safeReply,
      isAnswerRequest ? "answer_request_redirect" : "hint_request",
      turnAnalysis
    );
  }

  const hint = scenario.hints[next.supportLevel];
  next.lastDecision = isAnswerRequest
    ? "Withheld the answer because no new learner evidence supported escalation"
    : "Kept the current level because no attempt followed the previous support";
  next.lastEvidence = "A request alone does not count as evidence after the first hint";
  next.directAnswerWithheld = next.supportLevel < MAX_SUPPORT_LEVEL;

  if (next.supportLevel === MAX_SUPPORT_LEVEL) {
    return result(
      next,
      scenario,
      hint.prompt,
      isAnswerRequest ? "answer_request_at_maximum" : "hint_request_at_maximum",
      turnAnalysis
    );
  }

  const safeReply = isAnswerRequest
    ? `I will not jump straight to the solution. First show how you tried the current support: ${scenario.engagementPrompts[next.supportLevel]} ${hint.prompt}`
    : `Before I increase support again, show how you tried this level: ${scenario.engagementPrompts[next.supportLevel]} ${hint.prompt}`;
  return result(
    next,
    scenario,
    safeReply,
    isAnswerRequest ? "answer_request_redirect" : "hint_request_held",
    turnAnalysis
  );
}

export function evaluateTurn({ message, scenario, state, analysis = null }) {
  const text = message.trim();
  const next = {
    ...state,
    seenAttemptFingerprints: [...(state.seenAttemptFingerprints ?? [])],
    turnCount: state.turnCount + 1,
    modelFeedbackBlocked: false
  };
  const turnAnalysis = analyzeTurn(text, scenario, state, analysis);
  next.analysisSource = turnAnalysis.source;

  if (!text) {
    next.lastDecision = "Prompted for a substantive attempt";
    next.lastEvidence = "Empty input is not learner evidence";
    return result(
      next,
      scenario,
      "Take a moment to write a first step, an equation, or a specific question about where you are stuck.",
      "empty",
      turnAnalysis
    );
  }

  if (state.status === "complete") {
    next.lastDecision = "Kept the completed session closed";
    return result(
      next,
      scenario,
      "You completed this learning cycle. Choose another problem or reset this one to practice again.",
      "already_complete",
      turnAnalysis
    );
  }

  if (state.status === "awaiting_explanation") {
    const quality = explanationQuality(text, scenario, turnAnalysis);
    if (quality.sufficient) {
      next.status = "complete";
      next.lastDecision = "Accepted the self-explanation and completed the cycle";
      next.lastEvidence = "The explanation connected method, constraints, and verification";
      next.directAnswerWithheld = false;
      return result(
        next,
        scenario,
        "Your explanation connects the method to the problem constraints rather than only reporting a result. The learning cycle is complete.",
        "explanation_complete",
        turnAnalysis
      );
    }

    next.lastDecision = "Requested a deeper self-explanation";
    next.lastEvidence = "The explanation did not yet justify the method or verify the constraints";
    return result(
      next,
      scenario,
      `Go one step deeper: ${scenario.selfExplanationPrompt}`,
      "explanation_incomplete",
      turnAnalysis
    );
  }

  if (turnAnalysis.correctness === "correct") {
    next.status = "awaiting_explanation";
    next.detectedMisconception = null;
    next.lastDecision = "Confirmed the result and prompted self-explanation";
    next.lastEvidence = "The submitted result satisfies the scenario constraints";
    next.directAnswerWithheld = false;
    return result(
      next,
      scenario,
      `Your result satisfies the problem constraints. Before we finish: ${scenario.selfExplanationPrompt}`,
      "correct",
      turnAnalysis
    );
  }

  if (turnAnalysis.intent === "answer_request") {
    return requestSupport({ next, scenario, turnAnalysis, kind: "answer" });
  }

  if (turnAnalysis.intent === "hint_request") {
    return requestSupport({ next, scenario, turnAnalysis, kind: "hint" });
  }

  if (["off_topic", "unclear"].includes(turnAnalysis.intent)) {
    next.lastDecision = "Kept the ladder unchanged for an unrelated or unclear turn";
    next.lastEvidence = "The message did not provide interpretable work on the current problem";
    return result(
      next,
      scenario,
      `Let’s stay with the current problem. ${scenario.hints[next.supportLevel].prompt}`,
      turnAnalysis.intent,
      turnAnalysis
    );
  }

  const fingerprint = normalized(text);
  next.detectedMisconception = turnAnalysis.misconception;

  if (next.seenAttemptFingerprints.includes(fingerprint)) {
    next.duplicateAttempts += 1;
    next.lastDecision = "Ignored a duplicate submission for escalation";
    next.lastEvidence = "Repeating the same response does not add new reasoning evidence";
    const lead = next.detectedMisconception
      ? `${next.detectedMisconception.feedback} `
      : "That repeats an earlier response without showing a new step. ";
    return result(
      next,
      scenario,
      `${lead}${scenario.hints[next.supportLevel].prompt}`,
      "duplicate_attempt",
      turnAnalysis
    );
  }
  addFingerprint(next, fingerprint);

  if (turnAnalysis.effort !== "substantive") {
    next.lastDecision = next.detectedMisconception
      ? `Diagnosed “${next.detectedMisconception.label}” but held the level because only a result was submitted`
      : "Held the level because the response did not show a reasoning step";
    next.lastEvidence = "A bare answer or unsupported claim is not a meaningful attempt";
    const lead = next.detectedMisconception
      ? `${next.detectedMisconception.feedback} `
      : "A final number alone does not show enough reasoning to choose stronger support. ";
    return result(
      next,
      scenario,
      `${lead}${scenario.hints[next.supportLevel].prompt}`,
      next.detectedMisconception ? "misconception" : "minimal_attempt",
      turnAnalysis
    );
  }

  next.attempts += 1;
  next.attemptedAtCurrentLevel = true;
  const previousLevel = next.supportLevel;
  const canEscalate =
    next.supportLevel < MAX_SUPPORT_LEVEL &&
    (next.supportLevel === 0 || turnAnalysis.usesCurrentSupport);

  if (canEscalate) {
    next.supportLevel += 1;
    next.attemptedAtCurrentLevel = false;
    next.lastDecision =
      previousLevel === 0
        ? `Accepted a substantive first step and advanced to ${SUPPORT_LABELS[next.supportLevel].toLowerCase()}`
        : `Detected use of the current support and advanced to ${SUPPORT_LABELS[next.supportLevel].toLowerCase()}`;
    next.lastEvidence =
      previousLevel === 0
        ? "The learner showed a distinct reasoning step"
        : `The learner attempted the ${SUPPORT_LABELS[previousLevel].toLowerCase()} rather than repeating an answer`;
  } else if (next.supportLevel === MAX_SUPPORT_LEVEL) {
    next.lastDecision = "Kept worked explanation available while the learner checked the solution";
    next.lastEvidence = "A further substantive attempt was recorded at maximum support";
  } else {
    next.lastDecision = `Recorded a substantive attempt but kept ${SUPPORT_LABELS[next.supportLevel].toLowerCase()} until the current support is used`;
    next.lastEvidence = "The attempt was new, but it did not yet engage the current hint or strategy";
  }

  next.directAnswerWithheld = next.supportLevel < MAX_SUPPORT_LEVEL;
  const hint = scenario.hints[next.supportLevel];
  const misconceptionLead = next.detectedMisconception
    ? `${next.detectedMisconception.feedback} `
    : turnAnalysis.correctness === "partially_correct"
      ? "Part of that approach is useful, but one constraint still needs attention. "
      : "That step gives useful evidence about your reasoning. ";

  return result(
    next,
    scenario,
    `${misconceptionLead}${hint.prompt}`,
    next.detectedMisconception ? "misconception" : "incorrect",
    turnAnalysis
  );
}

export function enforceNoPrematureAnswer({ proposedReply, fallbackReply, scenario, state }) {
  if (state.directAnswerWithheld && containsForbiddenAnswer(proposedReply, scenario)) {
    return {
      reply: fallbackReply,
      blocked: true
    };
  }

  return {
    reply: proposedReply,
    blocked: false
  };
}

export function buildTrace(state, scenario) {
  return traceFrom(state, scenario);
}
