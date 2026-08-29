// server/src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import agentRoutes from "./routes/agent";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Enable CORS for Chrome Extensions and cross-origin requests
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Shared-Secret"],
  })
);

// Increase JSON body size limit to accommodate base64 sanitized screenshots
app.use(express.json({ limit: "25mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "privacy-vision-agent-server",
    geminiKeySet: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_testing"),
  });
});

// Agent routes
app.use("/api/agent", agentRoutes);

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`Privacy Vision Agent Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Agent endpoint: http://localhost:${PORT}/api/agent/step`);
  console.log(`=======================================================`);
});
