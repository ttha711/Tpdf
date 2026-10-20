import { randomUUID } from "node:crypto";

function rejected(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
export function createAgentWebJobs({ tenantRuntime, execute, timeoutMs = 120_000, concurrency = 2 }) {
  const jobs = new Map();
  const pending = [];
  let active = 0;
  const scopeKey = (identity) => identity.user.id + ":" + identity.projectId;
  function publicJob(job) {
    return { jobId: job.id, type: job.type, status: job.status, createdAt: job.createdAt,
      startedAt: job.startedAt, finishedAt: job.finishedAt, error: job.error };
  }
  function get(identity, id) {
    const job = jobs.get(id);
    if (!job || job.scope !== scopeKey(identity)) throw rejected("Job not found.", 404);
    return job;
  }
  function pump() {
    while (active < concurrency && pending.length) {
      const job = pending.shift();
      if (job.status !== "queued") continue;
      job.status = "running";
      job.startedAt = Date.now();
      active++;
      const timer = setTimeout(() => job.controller.abort("timeout"), timeoutMs);
      void tenantRuntime.run(job.identity.user, job.identity.projectId, async () => {
        try {
          const output = await execute(job.request, job.controller.signal, job.id);
          if (job.controller.signal.aborted) throw rejected("Job cancelled.", 409);
          job.result = output;
          job.status = "done";
        } catch (err) {
          job.status = job.controller.signal.aborted ? "cancelled" : "failed";
          job.error = job.controller.signal.aborted ? "Cancelled or timed out." : String(err.message).slice(0, 300);
        } finally {
          clearTimeout(timer);
          job.finishedAt = Date.now();
          active--;
          pump();
        }
      }).catch((err) => {
        clearTimeout(timer);
        job.status = "failed"; job.error = String(err.message); job.finishedAt = Date.now();
        active--; pump();
      });
    }
  }
  function create(identity, request) {
    if (!request || !["merge", "split", "export-images", "compare"].includes(request.type)) {
      throw rejected("Unsupported job type.");
    }
    if (pending.length >= 32) throw rejected("Job queue full.", 429);
    if (jobs.size >= 500) {
      for (const [id, job] of jobs) if (job.finishedAt && job.finishedAt < Date.now() - 3600_000) jobs.delete(id);
      if (jobs.size >= 500) throw rejected("Job cache full.", 429);
    }
    const job = { id: randomUUID(), type: request.type, scope: scopeKey(identity), identity, request,
      status: "queued", createdAt: Date.now(), controller: new AbortController() };
    jobs.set(job.id, job);
    pending.push(job);
    pump();
    return publicJob(job);
  }
  function status(identity, id) { return publicJob(get(identity, id)); }
  function result(identity, id) {
    const job = get(identity, id);
    if (job.status !== "done") throw rejected("Job result is not ready.", 409);
    return { jobId: job.id, status: job.status, result: job.result };
  }
  function cancel(identity, id) {
    const job = get(identity, id);
    if (["done", "cancelled", "failed"].includes(job.status)) return publicJob(job);
    job.controller.abort("user");
    if (job.status === "queued") {
      job.status = "cancelled"; job.finishedAt = Date.now();
      const at = pending.indexOf(job);
      if (at >= 0) pending.splice(at, 1);
    }
    return publicJob(job);
  }
  return { create, status, result, cancel };
}
