import express from "express";
import path from "path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import apiRouter from "./server/routes/index";
import largePdfJobsRouter from "./server/routes/largePdfJobs";
import { generalLimiter } from "./server/middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./server/middleware/errorHandler";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const bindHost = process.env.TPDF_EDITOR_BIND_HOST || "127.0.0.1";
  // Standalone editor uses a same-origin session cookie after one-time token exchange.
  // A bearer-only API gate cannot work with existing browser fetch callers.
  const apiToken = process.env.TPDF_EDITOR_API_TOKEN;
  if (bindHost !== "127.0.0.1" && bindHost !== "::1" && !apiToken) {
    throw new Error("Public editor binding requires TPDF_EDITOR_API_TOKEN.");
  }
  // Cookies contain random opaque session IDs, never the underlying long-lived API secret.
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  const sessions = new Map<string, number>();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
    standardHeaders: "draft-7", legacyHeaders: false });
  const validSecret = (candidate: unknown) => {
    if (!apiToken || typeof candidate !== "string") return false;
    const received = Buffer.from(candidate);
    const expected = Buffer.from(apiToken);
    return received.length === expected.length && timingSafeEqual(received, expected);
  };
  const hasSession = (req: express.Request) => {
    const cookie = (req.headers.cookie || "").split(";").map((item) => item.trim())
      .find((item) => item.startsWith("tpdf_editor_session="));
    const token = cookie?.slice("tpdf_editor_session=".length);
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      sessions.delete(token); return false;
    }
    return true;
  };
  const publicOrigin = process.env.TPDF_EDITOR_PUBLIC_ORIGIN?.replace(/\/$/, "");
  const checkOrigin: express.RequestHandler = (req, res, next) => {
    const origin = req.get("Origin");
    if (req.get("Sec-Fetch-Site") === "cross-site" ||
        (origin && origin !== (publicOrigin || `${req.protocol}://${req.get("host")}`))) {
      res.status(403).json({ code: "INVALID_ORIGIN" }); return;
    }
    next();
  };
  app.get("/auth/editor/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ authenticated: !apiToken || hasSession(req) });
  });
  app.post("/auth/editor", checkOrigin, loginLimiter, express.json({ limit: "2kb" }), (req, res) => {
    if (!validSecret(req.body?.token)) {
      res.status(401).json({ code: "UNAUTHORIZED" }); return;
    }
    if (sessions.size >= 1000) for (const [id, expiry] of sessions) {
      if (expiry < Date.now()) sessions.delete(id);
    }
    const session = randomBytes(32).toString("base64url");
    sessions.set(session, Date.now() + SESSION_TTL_MS);
    res.cookie("tpdf_editor_session", session, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: SESSION_TTL_MS,
    });
    res.status(204).end();
  });
  app.post("/auth/editor/logout", checkOrigin, (req, res) => {
    const cookie = (req.headers.cookie || "").split(";").map((item) => item.trim())
      .find((item) => item.startsWith("tpdf_editor_session="));
    if (cookie) sessions.delete(cookie.slice("tpdf_editor_session=".length));
    res.clearCookie("tpdf_editor_session", { path: "/" });
    res.status(204).end();
  });
  const protectApi: express.RequestHandler = (req, res, next) => {
    if (!apiToken) return next();
    if (!validSecret(req.get("Authorization")?.replace(/^Bearer /i, "")) && !hasSession(req)) {
      res.status(401).json({ code: "UNAUTHORIZED" }); return;
    }
    next();
  };

  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  // Stream multi-hundred-MB PDFs directly to disk before any JSON parser.
  // This keeps large-file jobs out of Node/Express body buffers.
  app.use("/api/pdf-jobs", checkOrigin, protectApi, generalLimiter, largePdfJobsRouter);

  // JSON APIs remain intentionally bounded; large PDFs must use /api/pdf-jobs.
  app.use(express.json({ limit: "50mb" }));

  // Global rate limit
  app.use("/api", checkOrigin, protectApi, generalLimiter);

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
