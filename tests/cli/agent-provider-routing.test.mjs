
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentPairingBroker } from "../../server/tpdf-agent-pairing.mjs";

test("worker advertises provider and jobs route only to matching worker", () => {
  const broker = createAgentPairingBroker("test-agent-provider-routing-secret-123456789");
  const user = { id: "alice" };
  const agent = broker.claimPairing(broker.startPairing(user, "one").code).agent;
  broker.heartbeatAgent(agent, { providers: ["codex", "unsafe", "codex"] });
  assert.deepEqual(broker.listAgents(user, "one")[0].providers, ["codex"]);
  assert.equal(broker.createTask(user, "one", { query: "test", provider: "claude" }), null);
  const task = broker.createTask(user, "one", { query: "test", provider: "codex" });
  assert.ok(task.id);
  assert.equal(broker.nextTask(agent).provider, "codex");
  assert.equal(broker.listTasks(user, "one")[0].id, task.id);
  assert.equal(broker.listTasks({ id: "bob" }, "one").length, 0);
});
test("running task survives restart as queued; owner isolation is enforced", () => {
  const directory = mkdtempSync(join(tmpdir(), "tpdf-agent-test-"));
  try {
    const path = join(directory, "agent-state.json");
    const secret = "durable-agent-broker-secret-1234567890";
    const user = { id: "user" };
    const first = createAgentPairingBroker(secret, { persistPath: path });
    const agent = first.claimPairing(first.startPairing(user, "project").code).agent;
    first.heartbeatAgent(agent, { providers: ["dify"] });
    const job = first.createTask(user, "project", { query: "rotate" });
    assert.equal(first.nextTask(agent).id, job.id);
    const restored = createAgentPairingBroker(secret, { persistPath: path });
    assert.equal(restored.getTask(user, "project", job.id).status, "queued");
    assert.equal(restored.listTasks(user, "project")[0].id, job.id);
    assert.equal(restored.getTask({ id: "outsider" }, "project", job.id), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
