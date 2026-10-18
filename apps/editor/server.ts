import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiRouter from "./server/routes/index";
import largePdfJobsRouter from "./server/routes/largePdfJobs";
import { generalLimiter } from "./server/middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./server/middleware/errorHandler";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const bindHost = process.env.TPDF_EDITOR_BIND_HOST || "127.0.0.1";
  const apiToken = process.env.TPDF_EDITOR_API_TOKEN;
  if (bindHost !== "127.0.0.1" && bindHost !== "::1" && !apiToken) {
    throw new Error("Public editor binding requires TPDF_EDITOR_API_TOKEN.");
  }
  const protectApi: express.RequestHandler = (req, res, next) => {
    if (!apiToken) return next();
    if (req.get("Authorization") !== `Bearer ${apiToken}`) {
      res.status(401).json({ code: "UNAUTHORIZED" });
      return;
    }
    next();
  };

  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  // Stream multi-hundred-MB PDFs directly to disk before any JSON parser.
  // This keeps large-file jobs out of Node/Express body buffers.
  app.use("/api/pdf-jobs", protectApi, generalLimiter, largePdfJobsRouter);

  // JSON APIs remain intentionally bounded; large PDFs must use /api/pdf-jobs.
  app.use(express.json({ limit: "50mb" }));

  // Global rate limit
  app.use("/api", protectApi, generalLimiter);

  // Register all modular api sub-routes
  app.use("/api", apiRouter);

  // Error handling
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, bindHost, () => {
    console.log(`Server running on http://${bindHost}:${PORT}`);
  });
}

startServer();
