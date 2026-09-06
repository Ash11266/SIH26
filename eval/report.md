# Privacy-Preserving Browser Vision Agent — Evaluation Report

Generated: 6/9/2026, 11:49:55 pm

## Final Composite Score: **96.22%**

### Competition Metric Breakdown

| Metric | Weight | Value | Target Benchmark | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1. Visual Context Accuracy** | 25% | **100.0%** | IoU >= 0.5 matching | PASS |
| **2. PII Detection Recall** | 20% | **90.9%** | High sensitivity | PASS |
| **3. Redaction Precision** | 20% | **100.0%** | Zero Leakage Goal | PASS |
| **4. Client Resource Usage** | 20% | **1.4ms** | Sub-50ms local processing | PASS |
| **5. End-to-End Latency** | 15% | **121.4ms** | Sub-1s total round-trip | PASS |

---

## Detailed Privacy & Redaction Statistics

- **Leakage Rate (Unredacted PII)**: **9.09%** (0 PII leaked to server payload)
- **Over-Redaction Rate**: **0.00%**
- **Total Test Fixtures Evaluated**: 5 pages (Login, Checkout, Chat, Video Call, Settings)

### PII Detection Breakdown by Category

| Category | Ground Truth Count | Detected & Redacted | Recall |
| :--- | :--- | :--- | :--- |
| `EMAIL` | 3 | 3 | **100.0%** |
| `PHONE` | 1 | 1 | **100.0%** |
| `SSN` | 1 | 1 | **100.0%** |
| `CARD` | 1 | 1 | **100.0%** |
| `PASSWORD` | 2 | 2 | **100.0%** |
| `API_KEY` | 1 | 0 | **0.0%** |
| `IP` | 1 | 1 | **100.0%** |
| `FACE` | 1 | 1 | **100.0%** |

---
*Evaluated automatically via `pnpm run eval`.*
