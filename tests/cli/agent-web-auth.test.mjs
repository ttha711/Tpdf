import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createAgentWebAuth } from "../../server/tpdf-agent-web-auth.mjs";

const secret = "0123456789abcdef0123456789abcdef";
const env = { TPDF_AGENT_WEB_BRIDGE_SECRET: secret, TPDF_AGENT_WEB_ORIGINS: "https://agent.example.test" };
const path = "/api/tpdf/agent/v1/documents";
const now = 1_800_000_000 * 1000;
let sequence = 0;
function signed(fields = {}, secretKey = secret) {
  sequence += 1;
  const claims = { iss: "agent-web", aud: "tpdf", email: "alice@example.test",
    projectId: "alpha", method: "POST", path, iat: 1_800_000_000,
    exp: 1_800_000_060, jti: "nonce-example-" + sequence, ...fields };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return payload + "." + createHmac("sha256", secretKey).update(payload).digest("base64url");
}
const req = (token, method = "POST") => ({ method, headers: { "x-tpdf-agent-web-identity": token } });
const url = (pathname = path) => new URL("https://tpdf.example.test" + pathname);

test("valid bridge identity is scoped to user and project", () => {
  const bridge = createAgentWebAuth(env, () => now);
  const value = bridge.verify(req(signed()), url());
  assert.equal(value.projectId, "alpha");
  assert.match(value.user.id, /^agent-web-/);
  assert.equal(value.user.email, "alice@example.test");
});

test("rejects bad signatures and incorrect audience", () => {
  const bridge = createAgentWebAuth(env, () => now);
  assert.throws(() => bridge.verify(req(signed({}, "wrong-secret")), url()));
  assert.throws(() => bridge.verify(req(signed({ aud: "other-service" })), url()));
});

test("rejects expired tokens and future-issued tokens", () => {
  const bridge = createAgentWebAuth(env, () => now);
  assert.throws(() => bridge.verify(req(signed({ exp: 1_800_000_000 })), url()));
  assert.throws(() => bridge.verify(req(signed({ iat: 1_800_000_020, exp: 1_800_000_060 })), url()));
  assert.throws(() => bridge.verify(req(signed({ exp: 1_800_000_120 })), url()));
});

test("rejects replay and wrong method or path", () => {
  const bridge = createAgentWebAuth(env, () => now);
  const token = signed();
  bridge.verify(req(token), url());
  assert.throws(() => bridge.verify(req(token), url()), /Replayed/);
  assert.throws(() => bridge.verify(req(signed()), url("/api/tpdf/agent/v1/documents/other")));
  assert.throws(() => bridge.verify(req(signed(), "GET"), url()));
});

test("rejects absent, invalid and mismatched project values", () => {
  const bridge = createAgentWebAuth(env, () => now);
  assert.throws(() => bridge.verify(req(signed({ projectId: "" })), url()));
  assert.throws(() => bridge.verify(req(signed({ projectId: "../beta" })), url()));
  assert.throws(() => bridge.verify(req(signed({ projectId: "ALPHA" })), url()));
});

test("embed sessions expire and use independent header", () => {
  let current = now;
  const bridge = createAgentWebAuth(env, () => current);
  const identity = bridge.verify(req(signed()), url());
  const session = bridge.newEmbedSession(identity);
  assert.equal(bridge.authorize({ method: "GET", headers: { "x-tpdf-embed-session": session.key } }, url()), identity);
  current += 901_000;
  assert.throws(() => bridge.authorize({ method: "GET", headers: { "x-tpdf-embed-session": session.key } }, url()));
});

test("fails closed for short bridge secrets and invalid allowed origins", () => {
  assert.throws(() => createAgentWebAuth({ TPDF_AGENT_WEB_BRIDGE_SECRET: "short" }));
  assert.throws(() => createAgentWebAuth({ ...env, TPDF_AGENT_WEB_ORIGINS: "https://example.test/hijack" }));
});
