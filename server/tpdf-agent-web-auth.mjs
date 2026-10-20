import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assertProjectId } from "./tpdf-tenancy.mjs";

const HEADER = "x-tpdf-agent-web-identity";
const SESSION_HEADER = "x-tpdf-embed-session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deny(message = "Invalid Agent Web credentials.", statusCode = 401) {
  return Object.assign(new Error(message), { statusCode });
}

export function createAgentWebAuth(env = process.env, now = () => Date.now()) {
  const secret = String(env.TPDF_AGENT_WEB_BRIDGE_SECRET || "");
  const enabled = Boolean(secret);
  if (enabled && secret.length < 32) throw new Error("TPDF_AGENT_WEB_BRIDGE_SECRET requires at least 32 characters.");
  const origins = String(env.TPDF_AGENT_WEB_ORIGINS || "")
    .split(",").map((entry) => entry.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("TPDF_AGENT_WEB_ORIGINS must contain absolute origins only.");
    }
  }
  const seen = new Map();
  const sessions = new Map();
  const limit = 10_000;
  const nowSeconds = () => Math.floor(now() / 1000);

  function prune(map) {
    const current = nowSeconds();
    for (const [key, expiration] of map) {
      const expires = typeof expiration === "number" ? expiration : expiration.exp;
      if (expires <= current) map.delete(key);
    }
    if (map.size >= limit) throw deny("Agent Web replay cache capacity exceeded.", 503);
  }

  function verify(req, url, token = req.headers[HEADER]) {
    if (!enabled) throw deny("Agent Web bridge is not configured.", 503);
    if (typeof token !== "string" || token.length > 4096) throw deny();
    const fragments = token.split(".");
    if (fragments.length !== 2 || fragments.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw deny();
    const [encoded, signature] = fragments;
    const expected = createHmac("sha256", secret).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw deny();
    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw deny();
    }
    const t = nowSeconds();
    if (payload?.iss !== "agent-web" || payload.aud !== "tpdf") throw deny();
    if (payload.method !== req.method || payload.path !== url.pathname) throw deny();
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.iat > t + 5 || payload.exp <= t || payload.exp <= payload.iat ||
        payload.exp - payload.iat > 60) throw deny();
    if (typeof payload.jti !== "string" || !/^[A-Za-z0-9_-]{12,128}$/.test(payload.jti)) throw deny();
    const email = String(payload.email || "").trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) throw deny();
    let projectId;
    try { projectId = assertProjectId(payload.projectId); }
    catch { throw deny("Invalid project.", 403); }
    if (!payload.projectId || projectId !== payload.projectId) throw deny("Invalid project.", 403);
    // The account is namespaced: it cannot impersonate an existing Tpdf user ID.
    const userId = "agent-web-" + createHash("sha256").update(email).digest("hex").slice(0, 32);
    prune(seen);
    const replayKey = userId + ":" + payload.jti;
    if (seen.has(replayKey)) throw deny("Replayed Agent Web identity.");
    seen.set(replayKey, payload.exp);
    return {
      email, projectId,
      user: { id: userId, email, role: "user", quotaBytes: Number(env.TPDF_AGENT_WEB_QUOTA_BYTES || 10 * 1024 ** 3) },
    };
  }

  function authorize(req, url) {
    if (req.headers[SESSION_HEADER]) {
      const key = String(req.headers[SESSION_HEADER]);
      prune(sessions);
      const session = sessions.get(key);
      if (!session) throw deny("Embed session expired.");
      return session.identity;
    }
    return verify(req, url);
  }

  function newEmbedSession(identity) {
    if (!origins.length) throw deny("Embed origin is not configured.", 503);
    prune(sessions);
    const key = randomBytes(32).toString("base64url");
    sessions.set(key, { identity, exp: nowSeconds() + 15 * 60 });
    return { key, origin: origins[0], projectId: identity.projectId };
  }

  return { enabled, origins, verify, authorize, newEmbedSession, header: HEADER, sessionHeader: SESSION_HEADER };
}
