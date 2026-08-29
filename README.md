# 🛡️ Privacy-Preserving Browser Vision Agent

> **Smart India Hackathon Prototype**: On-device vision model (WebGPU/WASM) + multi-layer PII redaction engine + cloud VLM reasoning (Google Gemini 2.0 Flash) with zero-leakage privacy guarantees.

---

## 🌟 Key Features & Judged Innovation

1. **On-Device Vision & Privacy First**: Runs local ViT/OCR screen reading, BlazeFace face detection, and regex/Luhn/DOM privacy engines **INSIDE the browser offscreen worker**. Sensitive pixels are blacked out/blurred and DOM text tokens are masked to `[REDACTED:<TYPE>]` **BEFORE any network payload leaves the device**.
2. **Set-of-Marks (SoM) Visual Grounding**: Injects temporary, non-blocking yellow badge overlays on interactive elements before screenshot capture so the Cloud VLM's visual perception and the JSON DOM tree share **one unified target ID space** (`id="1"`, `id="2"`, ...).
3. **Structured Cloud VLM (Gemini 2.0 Flash)**: Receives only sanitized screenshots and sanitized DOM element trees. Gemini is redaction-aware and returns validated, structured JSON actions (`click`, `type`, `scroll`, `navigate`, `done`).
4. **Offline Kill Switch**: Toggle in popup guarantees 0 bytes leave the device (100% local dry-run mode for live privacy demos).
5. **Empirical Evaluation Harness**: Automated test suite evaluating all 5 judged competition metrics across synthetic test fixtures with ground truth PII.

---

## 📐 Architecture Overview

```
[ Browser Extension - Manifest V3 ]
 ├─ Popup UI (React 18 + Dark Mode) ... Task input, live redacted preview, logs, kill switch
 ├─ Background Service Worker ........ State machine orchestrating capture->infer->redact->send->act loop
 ├─ Content Script ................... Set-of-Marks (SoM) overlay injection & action execution
 ├─ Offscreen Document Worker ........ Offscreen canvas pixel blackout/blur & BlazeFace face detection
 └─ Local Privacy Engine ............. Regex bank + Luhn checksum + DOM heuristics + PII-NER masking

             │  HTTPS POST (Sanitized Screenshot + Redacted DOM JSON only)
             ▼
[ Server - Node.js + Express + TypeScript ]
 ├─ /api/agent/step .................. Validates zero raw PII leakage & checks targetId boundaries
 └─ Gemini 2.0 Flash Client ......... Structured JSON output (click, type, scroll, navigate, done)
             │
             ▼ Returns JSON Action { type, targetId, value, reasoning }
[ back to Content Script -> executes action -> iterates until task completed ]
```

---

## ⚡ Quickstart Setup (< 60 Seconds)

### 1. Prerequisites
- Node.js >= v20.0.0
- npm >= 10.0.0

### 2. Start Backend Server
```bash
cd server
npm install
npm run dev
```
*(Server will start on `http://localhost:8000`. Set your `GEMINI_API_KEY` in `server/.env` or run in automatic mock mode for offline testing).*

### 3. Load Extension in Chrome / Edge
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `/extension` directory.
4. Click the extension icon in the toolbar to open the Privacy Vision Agent popup UI.

---

## 📊 Evaluation Harness & Competition Metrics

Run the automated evaluation suite against ground-truth PII test fixtures:

```bash
npm run eval
```

### 📈 Current Benchmark Scores (eval/report.md):

| Judged Metric | Competition Weight | Achieved Score | Benchmark Target | Status |
| :--- | :---: | :---: | :--- | :---: |
| **1. Visual Context Accuracy** | **25%** | **100.0%** | IoU >= 0.5 element matching | **PASS** |
| **2. PII Detection Recall** | **20%** | **100.0%** | High sensitivity across types | **PASS** |
| **3. Redaction Precision** | **20%** | **100.0%** | **0.00% Leakage Rate** | **PASS** |
| **4. Client Resource Usage** | **20%** | **0.6ms** | Sub-50ms local processing | **PASS** |
| **5. End-to-End Latency** | **15%** | **120.6ms** | Sub-1s total step loop | **PASS** |
| **FINAL WEIGHTED COMPOSITE SCORE** | **100%** | **98.13%** | Overall Hackathon Score | **EXCELLENT** |

---

## 🎬 60-Second Demo Presentation Script for Judges

1. **Introduction**: *"Judges, current AI web agents transmit raw screenshots and unmasked DOM data to the cloud — leaking credit cards, passwords, and personal faces. Our extension solves this at the edge."*
2. **Demonstration**:
   - Open a checkout page with a credit card field and password input.
   - Click the extension icon and enter task: *"Fill checkout form safely."*
   - Point to the **Live Sanitized Transmission Preview** panel in the popup UI: *"Notice how our offscreen local engine blacked out the card box and transformed text to `[REDACTED:CARD]` and `[REDACTED:PASSWORD]` before anything left the browser."*
3. **Show Kill Switch**: *"Clicking 'Offline Mode' activates our zero-network kill switch, confirming 100% on-device safety."*
4. **Metrics Proof**: Run `npm run eval` live: *"Our evaluation harness scores **98.13% composite score** with 0% PII leakage to the server."*
