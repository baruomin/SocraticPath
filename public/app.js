const state = {
  scenarios: [],
  selectedScenarioId: null,
  sessionId: null,
  mode: "demo",
  liveModeAvailable: false,
  busy: false
};

const elements = {
  scenarioList: document.querySelector("#scenario-list"),
  modeSelect: document.querySelector("#mode-select"),
  modeHelp: document.querySelector("#mode-help"),
  resetButton: document.querySelector("#reset-button"),
  exportButton: document.querySelector("#export-button"),
  difficulty: document.querySelector("#difficulty-badge"),
  objective: document.querySelector("#problem-objective"),
  title: document.querySelector("#problem-title"),
  prompt: document.querySelector("#problem-prompt"),
  notice: document.querySelector("#notice"),
  chatLog: document.querySelector("#chat-log"),
  hintButton: document.querySelector("#hint-button"),
  form: document.querySelector("#message-form"),
  input: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  traceStatus: document.querySelector("#trace-status"),
  traceAttempts: document.querySelector("#trace-attempts"),
  traceDuplicates: document.querySelector("#trace-duplicates"),
  traceMisconception: document.querySelector("#trace-misconception"),
  traceAnalysis: document.querySelector("#trace-analysis"),
  supportCount: document.querySelector("#support-count"),
  supportLadder: document.querySelector("#support-ladder"),
  nextTrigger: document.querySelector("#next-trigger"),
  policyDecision: document.querySelector("#policy-decision"),
  guardrailTitle: document.querySelector("#guardrail-title"),
  guardrailCopy: document.querySelector("#guardrail-copy")
};

function setBusy(busy) {
  state.busy = busy;
  elements.input.disabled = busy;
  elements.sendButton.disabled = busy;
  elements.hintButton.disabled = busy;
  elements.resetButton.disabled = busy;
  elements.exportButton.disabled = busy || !state.sessionId;
  elements.modeSelect.disabled = busy;
}

async function exportTrace() {
  if (!state.sessionId || state.busy) return;
  setBusy(true);
  showNotice(null);
  try {
    const response = await fetch(`/api/session/${encodeURIComponent(state.sessionId)}/export`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "The session trace could not be exported.");
    }
    const scenario = state.scenarios.find((item) => item.id === state.selectedScenarioId);
    const safeTitle = (scenario?.title || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json"
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `socraticpath-${safeTitle}-trace.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    showNotice("Session trace exported as JSON.");
  } catch (error) {
    showNotice(error.message);
  } finally {
    setBusy(false);
    elements.input.focus();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "The prototype could not complete that request.");
  }
  return payload;
}

function renderScenarioList() {
  elements.scenarioList.replaceChildren();
  for (const scenario of state.scenarios) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scenario-button${scenario.id === state.selectedScenarioId ? " active" : ""}`;
    button.dataset.scenarioId = scenario.id;
    button.setAttribute("aria-pressed", scenario.id === state.selectedScenarioId ? "true" : "false");

    const number = document.createElement("span");
    number.className = "scenario-number";
    number.textContent = scenario.sequence;

    const copy = document.createElement("span");
    copy.className = "scenario-copy";
    const title = document.createElement("strong");
    title.textContent = scenario.title;
    const difficulty = document.createElement("small");
    difficulty.textContent = scenario.difficulty;
    copy.append(title, difficulty);

    const chevron = document.createElement("span");
    chevron.className = "scenario-chevron";
    chevron.textContent = "›";

    button.append(number, copy, chevron);
    button.addEventListener("click", () => startSession(scenario.id));
    elements.scenarioList.append(button);
  }
}

function appendMessage(role, text, options = {}) {
  const loading = elements.chatLog.querySelector(".loading-state");
  if (loading) loading.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  if (options.id) row.id = options.id;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "student" ? "Y" : "S";

  const copy = document.createElement("div");
  copy.className = "message-copy";
  const name = document.createElement("p");
  name.className = "message-name";
  name.textContent = role === "student" ? "YOU" : "SOCRATICPATH";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  copy.append(name, bubble);

  row.append(avatar, copy);
  elements.chatLog.append(row);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function appendTyping() {
  const row = document.createElement("div");
  row.className = "message-row tutor";
  row.id = "typing-row";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "S";
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "Tutor is responding");
  indicator.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
  row.append(avatar, indicator);
  elements.chatLog.append(row);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function updateTrace(trace) {
  const statusLabels = {
    working: "Working",
    awaiting_explanation: "Self-explaining",
    complete: "Complete"
  };
  elements.traceStatus.textContent = statusLabels[trace.status] || trace.status;
  elements.traceAttempts.textContent = String(trace.attempts);
  elements.traceDuplicates.textContent = String(trace.duplicateAttempts);
  elements.traceMisconception.textContent = trace.detectedMisconception;
  elements.traceAnalysis.textContent = trace.analysisSource === "live" ? "Live LLM" : "Rule fallback";
  elements.supportCount.textContent = `Level ${trace.supportLevel + 1} of 5`;
  elements.policyDecision.textContent = trace.policyDecision;
  elements.nextTrigger.textContent = trace.nextEscalationTrigger;

  const ladderItems = [...elements.supportLadder.querySelectorAll("li")];
  ladderItems.forEach((item, index) => {
    item.classList.toggle("done", index < trace.supportLevel);
    item.classList.toggle("active", index === trace.supportLevel);
  });

  if (trace.status === "complete") {
    elements.guardrailTitle.textContent = "Learning cycle complete";
    elements.guardrailCopy.textContent = "The learner supplied a result and a substantive explanation.";
  } else if (trace.status === "awaiting_explanation") {
    elements.guardrailTitle.textContent = "Result established; reasoning needed";
    elements.guardrailCopy.textContent = "The cycle remains open until the learner explains and checks the method.";
  } else if (trace.directAnswerWithheld) {
    elements.guardrailTitle.textContent = "Direct-answer guard active";
    elements.guardrailCopy.textContent = "The final answer remains withheld until learner evidence authorizes worked support.";
  } else {
    elements.guardrailTitle.textContent = "Worked support authorized";
    elements.guardrailCopy.textContent = "The learner attempted each preceding support level before full explanation.";
  }
}

function showNotice(message) {
  if (!message) {
    elements.notice.hidden = true;
    elements.notice.textContent = "";
    return;
  }
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

async function startSession(scenarioId = state.selectedScenarioId) {
  if (!scenarioId || state.busy) return;
  setBusy(true);
  showNotice(null);
  try {
    const payload = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ scenarioId, mode: state.mode })
    });
    state.selectedScenarioId = scenarioId;
    state.sessionId = payload.sessionId;
    state.mode = payload.mode;
    elements.modeSelect.value = payload.mode;
    renderScenarioList();

    elements.difficulty.textContent = payload.scenario.difficulty;
    elements.objective.textContent = payload.scenario.objective;
    elements.title.textContent = payload.scenario.title;
    elements.prompt.textContent = payload.scenario.prompt;
    elements.chatLog.replaceChildren();
    for (const message of payload.messages) {
      appendMessage(message.role === "tutor" ? "tutor" : "student", message.text);
    }
    updateTrace(payload.trace);
    elements.input.value = "";
    elements.input.focus();
  } catch (error) {
    showNotice(error.message);
  } finally {
    setBusy(false);
  }
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message || !state.sessionId || state.busy) return;
  setBusy(true);
  showNotice(null);
  appendMessage("student", message);
  elements.input.value = "";
  elements.input.style.height = "auto";
  appendTyping();

  try {
    const payload = await api("/api/respond", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, message })
    });
    document.querySelector("#typing-row")?.remove();
    appendMessage("tutor", payload.reply);
    updateTrace(payload.trace);
    showNotice(payload.notice);
  } catch (error) {
    document.querySelector("#typing-row")?.remove();
    showNotice(error.message);
  } finally {
    setBusy(false);
    elements.input.focus();
  }
}

async function initialize() {
  try {
    const [config, scenarioPayload] = await Promise.all([
      api("/api/config"),
      api("/api/scenarios")
    ]);
    state.liveModeAvailable = config.liveModeAvailable;
    state.scenarios = scenarioPayload.scenarios;
    state.selectedScenarioId = state.scenarios[0]?.id ?? null;
    state.mode = state.liveModeAvailable ? "live" : "demo";

    const liveOption = elements.modeSelect.querySelector('option[value="live"]');
    liveOption.disabled = !state.liveModeAvailable;
    liveOption.textContent = state.liveModeAvailable ? "Live LLM" : "Live LLM · key needed";
    elements.modeSelect.value = state.mode;
    elements.modeHelp.textContent = state.liveModeAvailable
      ? `LLM interpretation + policy control (${config.model})`
      : "Rule fallback; add a key for free-form interpretation";

    renderScenarioList();
    await startSession();
  } catch (error) {
    showNotice(error.message);
    elements.chatLog.replaceChildren();
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.input.value);
});

elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

elements.input.addEventListener("input", () => {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 112)}px`;
});

elements.hintButton.addEventListener("click", () => sendMessage("I need a hint."));
elements.resetButton.addEventListener("click", () => startSession());
elements.exportButton.addEventListener("click", exportTrace);
elements.modeSelect.addEventListener("change", async () => {
  state.mode = elements.modeSelect.value;
  await startSession();
});

initialize();
