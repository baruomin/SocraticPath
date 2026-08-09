import test from "node:test";
import assert from "node:assert/strict";
import { getScenario } from "../src/scenarios.js";
import { initialTutorState } from "../src/policy.js";
import { analyzeLiveStudentTurn } from "../src/openai-client.js";

test("live interpretation uses a structured Responses API request", async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
    globalThis.fetch = previousFetch;
  });

  process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
  process.env.OPENAI_MODEL = "test-model";
  let capturedUrl = null;
  let capturedRequest = null;
  globalThis.fetch = async (url, request) => {
    capturedUrl = url;
    capturedRequest = request;
    return {
      ok: true,
      async json() {
        return {
          status: "completed",
          output_text: JSON.stringify({
            intent: "attempt",
            correctness: "partially_correct",
            effort: "substantive",
            uses_current_support: true,
            misconception_id: null,
            explanation_sufficient: false,
            feedback: "The two cost expressions are useful, but the equality still needs interpretation.",
            summary: "The learner modeled both plans and used the active concept."
          })
        };
      }
    };
  };

  const scenario = getScenario("makerspace-plans");
  const analysis = await analyzeLiveStudentTurn({
    scenario,
    studentMessage: "I wrote both plan costs and set them equal.",
    state: { ...initialTutorState(), supportLevel: 1 },
    recentMessages: [{ role: "tutor", text: scenario.hints[1].prompt }]
  });

  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  const body = JSON.parse(capturedRequest.body);
  assert.equal(body.model, "test-model");
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(analysis.source, "live");
  assert.equal(analysis.effort, "substantive");
  assert.equal(analysis.usesCurrentSupport, true);
});
