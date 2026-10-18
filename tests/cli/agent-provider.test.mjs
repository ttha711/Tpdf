import assert from "node:assert/strict";
import { test } from "node:test";
import { providerName, cliInvocation, extractCliAnswer, validateDecision, runModelDecision } from "../../scripts/tpdf-agent-provider.mjs";

test("provider selection", () => {
  assert.equal(providerName({}), "dify");
  assert.equal(providerName({ TPDF_AGENT_PROVIDER: "codex" }), "codex");
  assert.throws(() => providerName({ TPDF_AGENT_PROVIDER: "shell" }));
});
test("reject model authority escalation and commands", () => {
  assert.equal(validateDecision('{"action":"execute","tool":"save-pdf"}').tool, "save-pdf");
  assert.throws(() => validateDecision('{"action":"execute","tool":"save-pdf","args":{"confirmed":true}}'));
  assert.throws(() => validateDecision('{"action":"run","command":"echo foo"}'));
});
test("fixed CLI invocation", () => {
  assert.ok(cliInvocation("claude", {}, "linux").args.includes("--tools"));
  assert.ok(cliInvocation("codex", {}, "linux").args.includes("read-only"));
  assert.throws(() => cliInvocation("gemini", {}));
});
test("CLI envelopes", () => {
  assert.equal(extractCliAnswer("claude", '{"result":"ok"}'), "ok");
  assert.equal(extractCliAnswer("gemini", '{"response":"ok"}'), "ok");
  assert.equal(extractCliAnswer("codex", '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'), "ok");
});
test("Dify still works", async () => {
  const out = await runModelDecision("a goal", {
    env: {TPDF_DIFY_URL:"https://dify.example/v1",TPDF_DIFY_API_KEY:"test"},
    fetchImpl:async () => ({ok:true,text:async () => JSON.stringify({ answer: JSON.stringify({action:"ask",message:"Which page?"}) })}),
  });
  assert.equal(JSON.parse(out.answer).action, "ask");
});
