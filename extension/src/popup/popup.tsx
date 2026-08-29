// extension/src/popup/popup.tsx
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

interface AgentState {
  running: boolean;
  taskId: string;
  task: string;
  stepIndex: number;
  history: any[];
  killSwitch: boolean;
  serverUrl: string;
  latestContext?: any;
  logs: string[];
}

export const PopupUI: React.FC = () => {
  const [task, setTask] = useState("Fill checkout form without revealing my credit card or password.");
  const [state, setState] = useState<AgentState>({
    running: false,
    taskId: "",
    task: "",
    stepIndex: 1,
    history: [],
    killSwitch: false,
    serverUrl: "http://localhost:8000/api/agent/step",
    logs: [],
  });

  useEffect(() => {
    // Fetch initial state from background service worker
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "GET_STATE" }, (res) => {
        if (res) setState(res);
      });

      const messageListener = (msg: any) => {
        if (msg.action === "STATE_UPDATE" && msg.state) {
          setState(msg.state);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
  }, []);

  const handleStart = () => {
    if (!task.trim()) return;
    chrome.runtime.sendMessage({
      action: "START_TASK",
      task,
      killSwitch: state.killSwitch,
      serverUrl: state.serverUrl,
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ action: "STOP_TASK" });
  };

  const toggleKillSwitch = () => {
    const nextVal = !state.killSwitch;
    chrome.runtime.sendMessage({ action: "TOGGLE_KILL_SWITCH", enabled: nextVal });
    setState((prev) => ({ ...prev, killSwitch: nextVal }));
  };

  const totalRedactions =
    state.latestContext?.redactionSummary?.reduce((acc: number, item: any) => acc + item.count, 0) || 0;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px", height: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#60A5FA" }}>🛡️ Privacy Vision Agent</h2>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Client-Side ViT + Redaction + Cloud VLM</span>
        </div>
        <div
          style={{
            padding: "4px 8px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            backgroundColor: state.running ? "#065F46" : "#374151",
            color: state.running ? "#34D399" : "#9CA3AF",
          }}
        >
          {state.running ? `STEP ${state.stepIndex} ACTIVE` : "READY"}
        </div>
      </div>

      {/* Task Input */}
      <div>
        <label style={{ fontSize: "12px", fontWeight: 600, color: "#D1D5DB", marginBottom: "4px", display: "block" }}>
          Automation Task:
        </label>
        <textarea
          rows={2}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={state.running}
          style={{
            width: "100%",
            backgroundColor: "#1F2937",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#F3F4F6",
            padding: "8px",
            fontSize: "12px",
            resize: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Controls & Kill Switch */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {!state.running ? (
          <button
            onClick={handleStart}
            style={{
              flex: 1,
              backgroundColor: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 12px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ▶ Start Agent Loop
          </button>
        ) : (
          <button
            onClick={handleStop}
            style={{
              flex: 1,
              backgroundColor: "#DC2626",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 12px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ⏹ Stop Agent
          </button>
        )}

        <button
          onClick={toggleKillSwitch}
          title="Toggle fully offline local mode (no network traffic)"
          style={{
            backgroundColor: state.killSwitch ? "#D97706" : "#1F2937",
            color: state.killSwitch ? "#FEF3C7" : "#9CA3AF",
            border: "1px solid #374151",
            borderRadius: "8px",
            padding: "8px 10px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {state.killSwitch ? "🔒 Offline Mode ON" : "🌐 Server Mode"}
        </button>
      </div>

      {/* Live Redacted Screenshot Preview Panel */}
      <div
        style={{
          backgroundColor: "#111827",
          border: "1px solid #1F2937",
          borderRadius: "8px",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "#9CA3AF" }}>
          <span>LIVE SANITIZED TRANSMISSION PREVIEW</span>
          <span style={{ color: "#10B981" }}>{totalRedactions} Items Redacted</span>
        </div>

        {state.latestContext?.screenshot ? (
          <img
            src={state.latestContext.screenshot}
            alt="Redacted Preview"
            style={{ width: "100%", maxHeight: "130px", objectFit: "contain", borderRadius: "6px", border: "1px solid #374151" }}
          />
        ) : (
          <div
            style={{
              height: "100px",
              backgroundColor: "#1F2937",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6B7280",
              fontSize: "12px",
            }}
          >
            No active step screenshot captured yet
          </div>
        )}

        {/* Redaction Breakdown Badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
          {state.latestContext?.redactionSummary?.map((item: any, idx: number) => (
            <span
              key={idx}
              style={{
                backgroundColor: "#374151",
                color: "#F59E0B",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              🔒 {item.count} {item.type}
            </span>
          ))}
        </div>
      </div>

      {/* Log Feed */}
      <div style={{ flex: 1, overflowY: "auto", backgroundColor: "#030712", border: "1px solid #1F2937", borderRadius: "8px", padding: "8px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#6B7280", marginBottom: "4px" }}>EXECUTION LOGS</div>
        {state.logs.length === 0 ? (
          <div style={{ fontSize: "11px", color: "#4B5563" }}>Click Start Agent Loop to begin.</div>
        ) : (
          state.logs.slice(-20).map((log, i) => (
            <div key={i} style={{ fontSize: "11px", fontFamily: "monospace", color: "#D1D5DB", marginBottom: "2px" }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<PopupUI />);
}
