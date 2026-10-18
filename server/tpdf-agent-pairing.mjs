// tpdf-file-size-allow: Persisted pairing broker exceeds 300 lines; preserve lease/state behavior pending dedicated refactor.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PROVIDERS = new Set(["dify", "claude", "codex", "gemini"]);
const HISTORY_LIMIT = 250;
const MAX_OUTSTANDING_TASKS_PER_USER = 10;
const MAX_CONTEXT_BYTES = 64 * 1024;

function loadState(path) {
  if (!path || !existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data.version !== 1) throw new Error("Unknown agent state version.");
    return data;
  } catch (error) {
    throw new Error("Cannot load persisted agent state: " + String(error));
  }
}


function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAgentPairingBroker(secret, options = {}) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Agent pairing requires a secret of at least 32 characters.");
  }

  const pairingTtlMs = Number(options.pairingTtlMs || 5 * 60 * 1000);
  const tokenTtlMs = Number(options.tokenTtlMs || 30 * 24 * 60 * 60 * 1000);
  const taskTtlMs = Number(options.taskTtlMs || 30 * 24 * 60 * 60 * 1000);
  const presenceTtlMs = Number(options.presenceTtlMs || 20 * 1000);
  const leaseTtlMs = Number(options.leaseTtlMs || 30 * 1000);
  const maxAttempts = Number(options.maxAttempts || 2);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const state = loadState(options.persistPath);
  const pairings = new Map(state.pairings || []);
  const agents = new Map(state.agents || []);
  const tasks = new Map(state.tasks || []);
  // Running leases cannot survive a process restart. Requeue them safely.
  for (const row of tasks.values()) {
    if (row.status === "running") {
      row.status = "queued";
      row.claimedBy = null;
      row.leaseToken = null;
      row.leaseUntil = null;
    }
  }
  const persist = () => {
    if (!options.persistPath) return;
    const destination = options.persistPath;
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = destination + ".tmp";
    writeFileSync(temporary, JSON.stringify({
      version: 1, pairings: [...pairings], agents: [...agents], tasks: [...tasks],
    }), { mode: 0o600 });
    renameSync(temporary, destination);
  };

  const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

  function issueAgentToken(agent) {
    const payload = encode({
      type: "tpdf-machine-agent",
      agentId: agent.id,
      userId: agent.userId,
      projectId: agent.projectId,
      exp: now() + tokenTtlMs,
    });
    return `${payload}.${sign(payload)}`;
  }

  function verifyAgentToken(token) {
    if (typeof token !== "string") return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (parsed?.type !== "tpdf-machine-agent" || parsed.exp <= now()) return null;
      const agent = agents.get(parsed.agentId);
      return agent && agent.userId === parsed.userId && agent.projectId === parsed.projectId ? agent : null;
    } catch {
      return null;
    }
  }

  function cleanup() {
    const timestamp = now();
    let dirty = false;
    for (const [id, row] of pairings) if (row.expiresAt <= timestamp || row.claimedAt) {
      pairings.delete(id); dirty = true;
    }
    for (const [id, row] of tasks) {
      if (row.expiresAt <= timestamp) { tasks.delete(id); dirty = true; continue; }
      if (row.status !== "running" || row.leaseUntil > timestamp) continue;
      row.claimedBy = null;
      row.leaseToken = null;
      row.leaseUntil = null;
      dirty = true;
      if (row.attempts >= maxAttempts) {
        row.status = "failed";
        row.error = "Worker lost its task lease; automatic retry limit reached.";
        row.completedAt = timestamp;
      } else {
        row.status = "queued";
      }
    }
    const complete = [...tasks.entries()].filter(([, row]) => !["running", "queued"].includes(row.status))
      .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    while (complete.length > HISTORY_LIMIT) {
      tasks.delete(complete.shift()[0]); dirty = true;
    }
    if (dirty) persist();
  }

  function startPairing(user, projectId) {
    cleanup();
    const id = randomUUID();
    const code = randomBytes(5).toString("hex").toUpperCase();
    const row = {
      id,
      code,
      userId: user.id,
      projectId,
      createdAt: now(),
      expiresAt: now() + pairingTtlMs,
      claimedAt: null,
    };
    pairings.set(id, row);
    persist();
    return { pairingId: id, code, expiresAt: row.expiresAt };
  }

  function claimPairing(code, machine = {}) {
    cleanup();
    const normalized = String(code || "").trim().toUpperCase();
    const pairing = [...pairings.values()].find((row) => row.code === normalized && !row.claimedAt);
    if (!pairing) return null;
    pairing.claimedAt = now();
    const agent = {
      id: randomUUID(),
      userId: pairing.userId,
      projectId: pairing.projectId,
      machineId: String(machine.machineId || "").slice(0, 160),
      name: String(machine.name || "Local Machine Agent").slice(0, 160),
      version: String(machine.version || "").slice(0, 80),
      pairedAt: now(),
      lastSeenAt: now(),
      lastHeartbeatAt: null,
    };
    agent.providers = ["dify"];
    agents.set(agent.id, agent);
    persist();
    return { agent, token: issueAgentToken(agent) };
  }

  function heartbeatAgent(agent, payload = {}) {
    // Providers are worker-advertised capabilities, never executable paths or flags from the browser.
    const current = agents.get(agent.id);
    if (!current) return false;
    if (Array.isArray(payload.providers)) {
      current.providers = [...new Set(payload.providers.filter((name) => PROVIDERS.has(name)))];
    }
    current.lastHeartbeatAt = now();
    current.lastSeenAt = current.lastHeartbeatAt;
    persist();
    return true;
  }

  function isOnline(agent) {
    return agent.lastHeartbeatAt !== null &&
      now() - agent.lastHeartbeatAt <= presenceTtlMs;
  }

  function listAgents(user, projectId) {
    cleanup();
    return [...agents.values()]
      .filter((agent) => agent.userId === user.id && agent.projectId === projectId)
      .map((agent) => ({
        id: agent.id, name: agent.name, machineId: agent.machineId,
        version: agent.version, pairedAt: agent.pairedAt,
        lastSeenAt: agent.lastSeenAt, online: isOnline(agent),
        providers: Array.isArray(agent.providers) ? agent.providers : ["dify"],
      }));
  }

  function createTask(user, projectId, payload) {
    cleanup();
    const requested = String(payload.provider || "").toLowerCase();
    if (requested && !PROVIDERS.has(requested)) return null;
    const available = [...agents.values()].some(
      (agent) => agent.userId === user.id && agent.projectId === projectId && isOnline(agent) &&
        (!requested || (agent.providers || ["dify"]).includes(requested)),
    );
    if (!available) return null;
    const outstanding = [...tasks.values()].filter((task) =>
      task.userId === user.id && task.projectId === projectId &&
      (task.status === "queued" || task.status === "running")).length;
    if (outstanding >= MAX_OUTSTANDING_TASKS_PER_USER) return null;
    const context = payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
      ? payload.context : {};
    if (Buffer.byteLength(JSON.stringify(context), "utf8") > MAX_CONTEXT_BYTES) return null;
    if (typeof payload.query !== "string" || payload.query.length > 20000) return null;
    const id = randomUUID();
    const task = {
      id,
      userId: user.id,
      projectId,
      status: "queued",
      query: String(payload.query || ""),
      context,
      provider: requested || null,
      createdAt: now(),
      expiresAt: now() + taskTtlMs,
      claimedBy: null,
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
      result: null,
      error: null,
    };
    tasks.set(id, task);
    persist();
    return { id, status: task.status, provider: task.provider, createdAt: task.createdAt };
  }

  function nextTask(agent) {
    cleanup();
    heartbeatAgent(agent);
    const task = [...tasks.values()].find(
      (row) => row.userId === agent.userId &&
        row.projectId === agent.projectId &&
        row.status === "queued" && (!row.provider ||
          (agent.providers || ["dify"]).includes(row.provider)),
    );
    if (!task) return null;
    task.status = "running";
    task.claimedBy = agent.id;
    task.attempts += 1;
    task.leaseToken = randomBytes(16).toString("base64url");
    task.leaseUntil = now() + leaseTtlMs;
    persist();
    return {
      id: task.id, query: task.query, context: task.context,
      createdAt: task.createdAt, attempt: task.attempts, leaseToken: task.leaseToken,
      provider: task.provider,
    };
  }

  function renewTask(agent, taskId, leaseToken) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== agent.userId || task.projectId !== agent.projectId) return null;
    if (task.status !== "running" || task.claimedBy !== agent.id ||
        !leaseToken || task.leaseToken !== leaseToken) return null;
    task.leaseUntil = now() + leaseTtlMs;
    heartbeatAgent(agent);
    return { id: task.id, leaseUntil: task.leaseUntil };
  }

  function completeTask(agent, taskId, payload) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== agent.userId || task.projectId !== agent.projectId) return null;
    if (task.status !== "running" || task.claimedBy !== agent.id ||
        !payload?.leaseToken || task.leaseToken !== payload.leaseToken) return null;
    task.leaseUntil = null;
    task.leaseToken = null;
    task.status = payload?.error ? "failed" : "completed";
    task.result = payload?.result ?? payload?.answer ?? null;
    task.error = payload?.error ? String(payload.error).slice(0, 4000) : null;
    task.completedAt = now();
    agent.lastSeenAt = now();
    persist();
    return { id: task.id, status: task.status };
  }

  function cancelTask(user, projectId, taskId) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== user.id || task.projectId !== projectId) return null;
    if (task.status === "queued" || task.status === "running") {
      task.status = "cancelled";
      task.completedAt = now();
      task.result = null;
      task.error = null;
      task.context = {};
      task.query = "";
      persist();
    }
    return { id: task.id, status: task.status };
  }

  function getTask(user, projectId, taskId) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== user.id || task.projectId !== projectId) return null;
    return {
      id: task.id,
      status: task.status,
      provider: task.provider || null,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt ?? null,
    };
  }

  function listTasks(user, projectId) {
    cleanup();
    return [...tasks.values()].filter((task) => task.userId === user.id && task.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
      .map((task) => ({ id: task.id, status: task.status, provider: task.provider || null,
        query: task.query, createdAt: task.createdAt, completedAt: task.completedAt || null,
        error: task.error, result: task.result }));
  }

  return {
    listTasks,
    startPairing,
    claimPairing,
    verifyAgentToken,
    listAgents,
    heartbeatAgent,
    createTask,
    nextTask,
    completeTask,
    renewTask,
    getTask,
    cancelTask,
  };
}
