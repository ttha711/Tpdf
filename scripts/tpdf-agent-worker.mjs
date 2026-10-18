#!/usr/bin/env node
// TPDF machine worker: pairs with a server, requests structured AI decisions,
// and never executes model-proposed shell commands or document mutations.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { cliInvocation, processInvocation, providerName, runModelDecision, timeoutMs } from "./tpdf-agent-provider.mjs";

const env = process.env;
const base = String(env.TPDF_SERVER_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const tokenPath = resolve(env.TPDF_AGENT_TOKEN_FILE || homedir() + "/.tpdf/agent.json");
const command = process.argv[2] || "help";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function checkServerUrl() {
  const url = new URL(base);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) return;
  if (env.TPDF_AGENT_ALLOW_INSECURE_HTTP === "1") return;
  throw new Error("TPDF_SERVER_URL must be HTTPS or loopback HTTP (unsafe override: TPDF_AGENT_ALLOW_INSECURE_HTTP=1).");
}

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    signal: options.signal || AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 409 ? "Task lease expired or was cancelled." :
      "Server HTTP " + response.status;
    throw new Error(message);
  }
  return data;
}

async function saveToken(token) {
  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  await writeFile(tokenPath, JSON.stringify({ token, base }), { mode: 0o600 });
}

async function getToken() {
  const value = JSON.parse(await readFile(tokenPath, "utf8"));
  if (value.base !== base || typeof value.token !== "string") {
    throw new Error("Agent token is invalid or paired with another server.");
  }
  return value.token;
}

function auth(token) {
  return { Authorization: "Bearer " + token };
}

async function doctor() {
  checkServerUrl();
  const provider = providerName(env);
  const report = {
    server: base, provider,
    pairingFile: tokenPath, timeoutMs: timeoutMs(env),
    modelTools: "disabled-or-read-only", pdfMutations: "browser-approved-only",
  };
  if (provider === "dify") {
    report.configured = Boolean(env.TPDF_DIFY_URL && env.TPDF_DIFY_API_KEY);
    report.endpoint = env.TPDF_DIFY_URL || null;
  } else {
    const invocation = cliInvocation(provider, env);
    report.executable = invocation.bin;
    report.launch = processInvocation(invocation);
    report.configured = true;
    report.note = "Requires installed, authenticated CLI. This check does not invoke the model.";
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.configured) process.exitCode = 1;
}

async function pair(code) {
  checkServerUrl();
  if (!/^[0-9a-f]{10}$/i.test(code || "")) {
    throw new Error("Usage: node scripts/tpdf-agent-worker.mjs pair <10-CHARACTER-CODE>");
  }
  const provider = providerName(env);
  const result = await request("/api/tpdf/agent/pairing/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code, machine: { machineId: randomUUID(), name: "TPDF " + provider + " Worker", version: "3" },
    }),
  });
  await saveToken(result.token);
  process.stdout.write("TPDF worker paired successfully (" + provider + ").\n");
}

async function start() {
  checkServerUrl();
  const token = await getToken();
  const provider = providerName(env);
  // Fail fast on missing/unsafe local configuration before reporting online.
  if (provider === "dify" && (!env.TPDF_DIFY_URL || !env.TPDF_DIFY_API_KEY)) {
    throw new Error("Dify requires TPDF_DIFY_URL and TPDF_DIFY_API_KEY.");
  }
  if (provider !== "dify") cliInvocation(provider, env);
  process.stdout.write("TPDF " + provider + " worker ready (only the browser executes PDF actions).\n");
  let running = true;
  let controller = null;
  const stop = () => { running = false; controller?.abort(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const heartbeat = async () => {
    try {
      await request("/api/tpdf/agent/heartbeat", { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ providers: [provider] }) });
    } catch (error) {
      console.error("Agent heartbeat:", String(error));
    }
  };
  await heartbeat();
  const heartTimer = setInterval(() => { if (running) void heartbeat(); }, 8_000);
  try {
    while (running) {
      try {
        const next = await request("/api/tpdf/agent/tasks/next", { headers: auth(token) });
        if (!next.task) { await sleep(1250); continue; }
        const { id, query, leaseToken } = next.task;
        if (next.task.provider && next.task.provider !== provider) throw new Error("Task routed to wrong provider.");
        controller = new AbortController();
        let leaseLost = false;
        let renewing = false;
        const renew = async () => {
          if (renewing || leaseLost || controller.signal.aborted) return;
          renewing = true;
          try {
            await request("/api/tpdf/agent/tasks/" + id + "/renew", {
              method: "POST",
              headers: { ...auth(token), "Content-Type": "application/json" },
              body: JSON.stringify({ leaseToken }),
            });
          } catch (error) {
            leaseLost = true;
            controller.abort(); // Stop expensive CLI work if user cancels the task or lease is lost.
            console.error("Agent lease:", String(error));
          } finally {
            renewing = false;
          }
        };
        const timer = setInterval(() => { void renew(); }, 10_000);
        let outcome;
        try {
          outcome = await runModelDecision(String(query || ""), { signal: controller.signal });
        } catch (error) {
          outcome = { error: String(error instanceof Error ? error.message : error).slice(0, 4000) };
        } finally {
          clearInterval(timer);
        }
        const cancelled = controller.signal.aborted;
        controller = null;
        if (!running || leaseLost || cancelled) continue;
        await request("/api/tpdf/agent/tasks/" + id + "/result", {
          method: "POST",
          headers: { ...auth(token), "Content-Type": "application/json" },
          body: JSON.stringify({ ...outcome, leaseToken, ...(outcome.error ? {} : { result: outcome }) }),
        });
      } catch (error) {
        if (running) {
          console.error("Worker retry:", String(error));
          await sleep(2500);
        }
      }
    }
  } finally {
    clearInterval(heartTimer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

try {
  if (command === "doctor") await doctor();
  else if (command === "pair") await pair(process.argv[3]);
  else if (command === "start") await start();
  else {
    process.stdout.write("TPDF AI worker: doctor | pair <CODE> | start\n");
    process.exitCode = command === "help" ? 0 : 2;
  }
} catch (error) {
  console.error("TPDF worker:", String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
