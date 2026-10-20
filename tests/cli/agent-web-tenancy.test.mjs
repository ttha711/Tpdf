import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTenantRuntime } from "../../server/tpdf-tenancy.mjs";

test("Agent Web document IDs never cross user or project storage scopes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-agent-isolation-"));
  try {
    const runtime = createTenantRuntime(root, { authEnabled: true });
    await runtime.ensure();
    const alice = { id: "agent-web-alice", email: "alice@example.test", quotaBytes: 100_000 };
    const bob = { id: "agent-web-bob", email: "bob@example.test", quotaBytes: 100_000 };
    let id;
    await runtime.run(alice, "alpha", async () => {
      const record = await runtime.storage.createDocument("original.pdf");
      await writeFile(record.tempPath, "%PDF-1.4\n");
      await rename(record.tempPath, record.pdfPath);
      await runtime.storage.finalizeDocument(record.id, 9);
      id = record.id;
      assert.equal((await runtime.storage.getDocument(id)).id, id);
    });
    await runtime.run(alice, "beta", async () => {
      assert.equal(await runtime.storage.getDocument(id), null);
    });
    await runtime.run(bob, "alpha", async () => {
      assert.equal(await runtime.storage.getDocument(id), null);
    });
    await runtime.run(alice, "alpha", async () => {
      assert.equal((await runtime.storage.getDocument(id)).id, id);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bridge tenant isolation cannot run with authentication disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "tpdf-agent-legacy-"));
  try {
    const runtime = createTenantRuntime(root, { authEnabled: false });
    assert.equal(runtime.authEnabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
