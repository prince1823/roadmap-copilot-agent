import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import roadmapCopilotRouter from "./routes/roadmapCopilot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "1mb" }));

// Serve UI
app.use(express.static(path.join(__dirname, "..", "public")));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Agent endpoint
app.use("/ai/roadmap-copilot", roadmapCopilotRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
);

app.listen(PORT, () => {
  console.log(`Roadmap Copilot Agent running on http://localhost:${PORT}`);
  console.log(`POST http://localhost:${PORT}/ai/roadmap-copilot/run`);
});

export default app;
