import test from "node:test";
import assert from "node:assert/strict";
import { createAgentWebJobs } from "../../server/tpdf-agent-web-jobs.mjs";
const one = { user: { id: "first" }, projectId: "alpha" };
const other = { user: { id: "first" }, projectId: "beta" };
const tenantRuntime = { run: (_user, _project, callback) => callback() };
const tick = () => new Promise((r) => setTimeout(r, 20));

test("async job result isolated by identity and project", async () => {
  const jobs = createAgentWebJobs({ tenantRuntime, execute: async () => ({ documentId: "version-1" }) });
  const job = jobs.create(one, { type: "merge" });
  assert.throws(() => jobs.status(other, job.jobId), /not found/);
  for (let i = 0; i < 10 && jobs.status(one, job.jobId).status !== "done"; i++) await tick();
  assert.equal(jobs.result(one, job.jobId).result.documentId, "version-1");
  assert.throws(() => jobs.result(other, job.jobId));
});
test("abort cancels queued and running jobs", async () => {
  const jobs = createAgentWebJobs({ tenantRuntime, concurrency: 1, execute: async (_request, signal) => {
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
  } });
  const first = jobs.create(one, { type: "compare" });
  const second = jobs.create(one, { type: "split" });
  assert.equal(jobs.cancel(one, second.jobId).status, "cancelled");
  jobs.cancel(one, first.jobId);
  for (let i = 0; i < 10 && jobs.status(one, first.jobId).status !== "cancelled"; i++) await tick();
  assert.equal(jobs.status(one, first.jobId).status, "cancelled");
});
test("reject unsupported jobs", () => {
  const jobs = createAgentWebJobs({ tenantRuntime, execute: async () => ({}) });
  assert.throws(() => jobs.create(one, { type: "execute-model" }));
});
