// extension/src/background/index.ts
import { AgentAction, SanitizedContext, StepHistoryItem } from "../../shared/types";

let agentState: {
  running: boolean;
  taskId: string;
  task: string;
  stepIndex: number;
  history: StepHistoryItem[];
  killSwitch: boolean;
  serverUrl: string;
  latestContext?: SanitizedContext;
  logs: string[];
} = {
  running: false,
  taskId: "",
  task: "",
  stepIndex: 1,
  history: [],
  killSwitch: false,
  serverUrl: "http://localhost:8000/api/agent/step",
  logs: [],
};

const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";

async function ensureOffscreenDocumentExists(): Promise<void> {
  if (!chrome.offscreen) return;
  const existingContexts = await chrome.offscreen.hasDocument();
  if (!existingContexts) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.DOM_PARSER, chrome.offscreen.Reason.BLOBS],
      justification: "Runs local vision model, BlazeFace, and offscreen canvas PII pixel redaction.",
    });
  }
}

function logMessage(msg: string) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  agentState.logs.push(entry);
  console.log(entry);
  chrome.runtime.sendMessage({ action: "STATE_UPDATE", state: agentState }).catch(() => {});
}

async function runAgentLoop(): Promise<void> {
  await ensureOffscreenDocumentExists();

  while (agentState.running && agentState.stepIndex <= 15) {
    logMessage(`--- Starting Step ${agentState.stepIndex} ---`);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      logMessage("Error: No active tab found.");
      break;
    }

    // Step A: DOM Extraction & Set-of-Marks Injection
    logMessage("Extracting DOM elements and injecting Set-of-Marks badges...");
    let domResponse: any;
    try {
      domResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_DOM" });
    } catch (err) {
      logMessage(`DOM Extraction failed. Retrying... ${err}`);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    // Step B: Screen Capture
    logMessage("Capturing visible tab screenshot with visual grounding marks...");
    const rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

    // Step C: Clear Set-of-Marks overlay from live page
    await chrome.tabs.sendMessage(tab.id, { action: "CLEAR_SOM" }).catch(() => {});

    // Step D: Local Offscreen Vision & Redaction Pipeline
    logMessage("Running local vision ViT, BlazeFace, and canvas PII redaction...");
    let redactionResult: any;
    try {
      redactionResult = await chrome.runtime.sendMessage({
        target: "offscreen",
        action: "PROCESS_REDACTION",
        payload: {
          taskId: agentState.taskId,
          stepIndex: agentState.stepIndex,
          screenshotRaw: rawScreenshot,
          elements: domResponse.elements,
          viewport: domResponse.viewport,
        },
      });
    } catch (err: any) {
      logMessage(`Offscreen redaction failed: ${err}`);
      break;
    }

    if (!redactionResult || !redactionResult.success) {
      logMessage(`Offscreen redaction error: ${redactionResult?.error || "Unknown"}`);
      break;
    }

    const sanitizedContext: SanitizedContext = redactionResult.sanitizedContext;
    agentState.latestContext = sanitizedContext;

    logMessage(
      `Redacted ${sanitizedContext.redactionSummary.reduce((acc, r) => acc + r.count, 0)} items (` +
        `${sanitizedContext.redactionSummary.map((r) => `${r.count} ${r.type}`).join(", ") || "none"}).`
    );

    // Step E: Server Call or Local Kill-Switch Dry Run
    let returnedAction: AgentAction;
    if (agentState.killSwitch) {
      logMessage("[Kill Switch ON] Local dry-run mode active. No data sent to server.");
      returnedAction = {
        type: "click",
        targetId: sanitizedContext.elements[0]?.id || "1",
        reasoning: "Local offline dry-run step.",
        done: agentState.stepIndex >= 3,
        confidence: 1.0,
      };
    } else {
      logMessage(`Posting sanitized context to server API (${agentState.serverUrl})...`);
      try {
        const resp = await fetch(agentState.serverUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shared-Secret": "privacy_agent_secret",
          },
          body: JSON.stringify({
            task: agentState.task,
            context: sanitizedContext,
            history: agentState.history,
          }),
        });

        const data = await resp.json();
        if (!data.success || !data.action) {
          logMessage(`Server API error: ${data.error || "No action returned"}`);
          break;
        }
        returnedAction = data.action;
        logMessage(`Server VLM decision (${data.latencyMs?.total || 0}ms): ${returnedAction.type} -> ${returnedAction.reasoning}`);
      } catch (err: any) {
        logMessage(`Network failure posting to server: ${err.message || err}`);
        break;
      }
    }

    // Step F: Record History
    agentState.history.push({
      stepIndex: agentState.stepIndex,
      action: returnedAction,
      redactionCount: sanitizedContext.redactionSummary.reduce((a, b) => a + b.count, 0),
      timestamp: Date.now(),
    });

    if (returnedAction.done) {
      logMessage(`Task Completed! Reason: ${returnedAction.reasoning}`);
      agentState.running = false;
      break;
    }

    // Step G: Content Script Action Execution
    logMessage(`Executing action ${returnedAction.type} on element #${returnedAction.targetId || "N/A"}...`);
    try {
      const execResult = await chrome.tabs.sendMessage(tab.id, {
        action: "EXECUTE_ACTION",
        agentAction: returnedAction,
      });
      logMessage(`Execution result: ${execResult.message}`);
    } catch (err: any) {
      logMessage(`Action execution failed: ${err.message || err}`);
    }

    agentState.stepIndex++;
    await new Promise((r) => setTimeout(r, 1500)); // Pause briefly before next step
  }

  agentState.running = false;
  logMessage("Agent loop finished.");
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_STATE") {
    sendResponse(agentState);
    return true;
  }

  if (message.action === "START_TASK") {
    agentState = {
      running: true,
      taskId: `task_${Date.now()}`,
      task: message.task,
      stepIndex: 1,
      history: [],
      killSwitch: message.killSwitch || false,
      serverUrl: message.serverUrl || "http://localhost:8000/api/agent/step",
      logs: [],
    };
    logMessage(`Task Started: "${message.task}"`);
    runAgentLoop();
    sendResponse({ success: true, taskId: agentState.taskId });
    return true;
  }

  if (message.action === "STOP_TASK") {
    agentState.running = false;
    logMessage("Task stopped by user.");
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "TOGGLE_KILL_SWITCH") {
    agentState.killSwitch = message.enabled;
    logMessage(`Kill switch set to: ${agentState.killSwitch}`);
    sendResponse({ success: true });
    return true;
  }
});
