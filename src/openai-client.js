const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["attempt", "hint_request", "answer_request", "off_topic", "unclear", "self_explanation"]
    },
    correctness: {
      type: "string",
      enum: ["correct", "partially_correct", "incorrect", "not_applicable"]
    },
    effort: {
      type: "string",
      enum: ["substantive", "minimal", "none"]
    },
    uses_current_support: { type: "boolean" },
    misconception_id: { type: ["string", "null"] },
    explanation_sufficient: { type: "boolean" },
    feedback: { type: "string" },
    summary: { type: "string" }
  },
  required: [
    "intent",
    "correctness",
    "effort",
    "uses_current_support",
    "misconception_id",
    "explanation_sufficient",
    "feedback",
    "summary"
  ],
  additionalProperties: false
};

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const pieces = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(`The model declined to analyze the turn: ${content.refusal || "refusal"}`);
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

function validateAnalysis(value, scenario) {
  const intentValues = new Set([
    "attempt",
    "hint_request",
    "answer_request",
    "off_topic",
    "unclear",
    "self_explanation"
  ]);
  const correctnessValues = new Set(["correct", "partially_correct", "incorrect", "not_applicable"]);
  const effortValues = new Set(["substantive", "minimal", "none"]);
  if (!value || typeof value !== "object") throw new Error("The model analysis was not an object");
  if (!intentValues.has(value.intent)) throw new Error("The model returned an unknown intent");
  if (!correctnessValues.has(value.correctness)) throw new Error("The model returned unknown correctness");
  if (!effortValues.has(value.effort)) throw new Error("The model returned unknown effort");
  if (typeof value.uses_current_support !== "boolean") {
    throw new Error("The model omitted current-support evidence");
  }
  if (typeof value.explanation_sufficient !== "boolean") {
    throw new Error("The model omitted explanation quality");
  }
  if (typeof value.feedback !== "string" || typeof value.summary !== "string") {
    throw new Error("The model omitted diagnostic text");
  }
  const allowedMisconceptions = new Set(scenario.misconceptions.map((item) => item.id));
  const misconceptionId = allowedMisconceptions.has(value.misconception_id)
    ? value.misconception_id
    : null;

  return {
    source: "live",
    intent: value.intent,
    correctness: value.correctness,
    effort: value.effort,
    usesCurrentSupport: value.uses_current_support,
    misconceptionId,
    explanationSufficient: value.explanation_sufficient,
    feedback: value.feedback,
    summary: value.summary
  };
}

export function liveModeAvailable() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function analyzeLiveStudentTurn({
  scenario,
  studentMessage,
  state,
  recentMessages = []
}) {
  if (!liveModeAvailable()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const currentSupport = scenario.hints[state.supportLevel];
  const instructions = [
    "You are the diagnostic component of SocraticPath, an introductory-algebra tutoring system.",
    "Analyze the learner's latest message; do not solve the problem for the learner.",
    "A substantive attempt must show a mathematical operation, model, equation, or reasoned explanation. A lone number, unsupported answer, repeated claim, hint request, or answer request is not substantive.",
    "uses_current_support is true only when the learner actually applies or directly responds to the currently displayed support—not merely when the message is on topic.",
    "Choose a misconception_id only from the supplied authored list and only when the message provides evidence for it; otherwise use null.",
    "explanation_sufficient is relevant only during the self-explanation stage. It requires a justification of the method plus a check against the problem constraints.",
    "feedback must be one concise diagnostic sentence, at most 35 words. Never state the hidden final answer or provide a complete solution in feedback, even if asked.",
    "summary is a short instructor-facing description of what evidence the message contains."
  ].join("\n");

  const input = JSON.stringify(
    {
      problem: scenario.prompt,
      learning_goal: scenario.objective,
      hidden_answer_for_assessment_only: scenario.answerLabel,
      interaction_status: state.status,
      active_support_level: state.supportLevel + 1,
      active_support_type: currentSupport.label,
      active_support_content: currentSupport.prompt,
      evidence_prompt: scenario.engagementPrompts[state.supportLevel],
      authored_misconceptions: scenario.misconceptions.map(({ id, label }) => ({ id, label })),
      meaningful_attempts_so_far: state.attempts,
      recent_conversation: recentMessages.slice(-6).map(({ role, text }) => ({ role, text })),
      latest_student_message: studentMessage
    },
    null,
    2
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      instructions,
      input,
      store: false,
      max_output_tokens: 600,
      text: {
        format: {
          type: "json_schema",
          name: "socraticpath_turn_analysis",
          schema: ANALYSIS_SCHEMA,
          strict: true
        }
      }
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API returned ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload = await response.json();
  if (payload.status === "incomplete") {
    throw new Error(`The model analysis was incomplete: ${payload.incomplete_details?.reason || "unknown"}`);
  }
  const output = extractOutputText(payload);
  if (!output) throw new Error("The model returned no turn analysis");

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("The model returned invalid structured analysis");
  }
  return validateAnalysis(parsed, scenario);
}
