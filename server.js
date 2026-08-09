import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { scenarios, getScenario, toPublicScenario } from "./src/scenarios.js";
import { initialTutorState, evaluateTurn, buildTrace } from "./src/policy.js";
import { analyzeLiveStudentTurn, liveModeAvailable } from "./src/openai-client.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(root, "public");
const sessions = new Map();

async function loadLocalEnvironment() {
  try {
    const contents = await readFile(resolve(root, ".env"), "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in process.env) continue;
      let value = line.slice(separator + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadLocalEnvironment();

const port = Number(process.env.PORT || 4173);
const prototypeVersion = "1.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function newSession(scenario, requestedMode) {
  const mode = requestedMode === "live" && liveModeAvailable() ? "live" : "demo";
  const state = initialTutorState();
  const id = randomUUID();
  const session = {
    id,
    scenarioId: scenario.id,
    mode,
    state,
    messages: [
      {
        role: "tutor",
        text: `Let’s work on this together. ${scenario.openingQuestion}`,
        timestamp: new Date().toISOString()
      }
    ],
    events: [],
    createdAt: new Date().toISOString()
  };
  sessions.set(id, session);
  return session;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, {
      liveModeAvailable: liveModeAvailable(),
      model: liveModeAvailable() ? process.env.OPENAI_MODEL || "gpt-5.6" : null,
      prototype: `SocraticPath ${prototypeVersion}`
    });
  }

  if (request.method === "GET" && url.pathname === "/api/scenarios") {
    return sendJson(response, 200, {
      scenarios: scenarios.map(toPublicScenario)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/session") {
    const body = await readJson(request);
    const scenario = getScenario(body.scenarioId);
    if (!scenario) {
      return sendJson(response, 404, { error: "Unknown scenario" });
    }
    const session = newSession(scenario, body.mode);
    return sendJson(response, 201, {
      sessionId: session.id,
      mode: session.mode,
      scenario: toPublicScenario(scenario),
      messages: session.messages,
      trace: buildTrace(session.state, scenario)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/respond") {
    const body = await readJson(request);
    const session = sessions.get(body.sessionId);
    if (!session) {
      return sendJson(response, 404, { error: "Session not found. Start a new problem." });
    }
    if (typeof body.message !== "string") {
      return sendJson(response, 400, { error: "A text message is required" });
    }

    const scenario = getScenario(session.scenarioId);
    let turnAnalysis = null;
    let modeUsed = "demo";
    let notice = null;

    if (session.mode === "live") {
      try {
        turnAnalysis = await analyzeLiveStudentTurn({
          scenario,
          studentMessage: body.message,
          state: session.state,
          recentMessages: session.messages
        });
        modeUsed = "live";
      } catch (error) {
        modeUsed = "demo-api-fallback";
        notice = "Live interpretation was unavailable, so the rule-based fallback was used for this turn.";
        console.error(error.message);
      }
    }

    const outcome = evaluateTurn({
      message: body.message,
      scenario,
      state: session.state,
      analysis: turnAnalysis
    });
    const reply = outcome.reply;
    const safetyFallback = outcome.trace.modelFeedbackBlocked;
    if (safetyFallback && modeUsed === "live") {
      modeUsed = "live-safety-fallback";
      notice = "The personalized diagnostic was replaced because it revealed protected answer content.";
    }

    session.state = outcome.state;
    session.messages.push(
      { role: "student", text: body.message, timestamp: new Date().toISOString() },
      { role: "tutor", text: reply, timestamp: new Date().toISOString() }
    );
    session.events.push({
      turn: session.events.length + 1,
      studentMessage: body.message,
      intent: outcome.intent,
      supportLevel: outcome.trace.supportLevel,
      supportLabel: outcome.trace.supportLabel,
      attempts: outcome.trace.attempts,
      duplicateAttempts: outcome.trace.duplicateAttempts,
      detectedMisconception: outcome.trace.detectedMisconception,
      evidence: outcome.trace.evidence,
      policyDecision: outcome.trace.policyDecision,
      nextEscalationTrigger: outcome.trace.nextEscalationTrigger,
      analysisSource: outcome.trace.analysisSource,
      directAnswerWithheld: outcome.trace.directAnswerWithheld,
      modeUsed,
      safetyFallback,
      timestamp: new Date().toISOString()
    });

    return sendJson(response, 200, {
      reply,
      intent: outcome.intent,
      trace: outcome.trace,
      modeUsed,
      safetyFallback,
      notice
    });
  }

  if (request.method === "GET" && /^\/api\/session\/[^/]+\/export$/.test(url.pathname)) {
    const sessionId = decodeURIComponent(url.pathname.split("/")[3]);
    const session = sessions.get(sessionId);
    if (!session) {
      return sendJson(response, 404, { error: "Session not found. Start a new problem." });
    }
    const scenario = getScenario(session.scenarioId);
    return sendJson(response, 200, {
      prototype: "SocraticPath",
      version: prototypeVersion,
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        createdAt: session.createdAt,
        mode: session.mode,
        scenario: toPublicScenario(scenario),
        finalTrace: buildTrace(session.state, scenario),
        events: session.events,
        messages: session.messages
      }
    });
  }

  return sendJson(response, 404, { error: "API route not found" });
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      await serveStatic(response, url.pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "The prototype encountered an unexpected error." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SocraticPath is running at http://127.0.0.1:${port}`);
  console.log(`Tutor mode: ${liveModeAvailable() ? "Demo + Live LLM" : "Demo (set OPENAI_API_KEY for Live LLM)"}`);
});
