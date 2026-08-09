import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function waitUntilReady(baseUrl, process) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`Prototype server exited with code ${process.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) return;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Prototype server did not become ready");
}

test("the local server exposes the interface and completes a tutoring turn", async (context) => {
  const port = 43100 + Math.floor(Math.random() * 500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "" },
    stdio: "ignore"
  });
  context.after(() => child.kill("SIGTERM"));

  await waitUntilReady(baseUrl, child);

  const home = await fetch(baseUrl);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /SocraticPath/);

  const scenarioResponse = await fetch(`${baseUrl}/api/scenarios`);
  const scenarioPayload = await scenarioResponse.json();
  assert.equal(scenarioPayload.scenarios.length, 3);
  assert.equal("workedSolution" in scenarioPayload.scenarios[0], false);

  const sessionResponse = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenarioId: "garden-design", mode: "demo" })
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();

  const turnResponse = await fetch(`${baseUrl}/api/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: session.sessionId,
      message: "I used area, so w(2w + 3) = 54."
    })
  });
  assert.equal(turnResponse.status, 200);
  const turn = await turnResponse.json();
  assert.equal(turn.trace.detectedMisconception, "Used area instead of perimeter");
  assert.equal(turn.trace.directAnswerWithheld, true);
  assert.equal(turn.trace.supportLevel, 1);
  assert.equal("progress" in turn.trace, false);
  assert.match(turn.trace.nextEscalationTrigger, /2w \+ 2l/i);

  const exportResponse = await fetch(
    `${baseUrl}/api/session/${encodeURIComponent(session.sessionId)}/export`
  );
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  assert.equal(exported.version, "1.1");
  assert.equal(exported.session.events.length, 1);
  assert.equal(exported.session.events[0].intent, "misconception");
  assert.equal(exported.session.messages.length, 3);
});
