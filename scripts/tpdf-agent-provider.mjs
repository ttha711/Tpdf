// Model planner only: no model-authored shell commands, scripts, or CLI flags.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PROVIDERS = Object.freeze(["dify", "claude", "codex", "gemini"]);
const MAX_PROMPT = 48_000;
const MAX_OUTPUT = 256_000;
const MAX_DECISION = 16_000;

export function providerName(env = process.env) {
  const value = String(env.TPDF_AGENT_PROVIDER || "dify").trim().toLowerCase();
  if (!PROVIDERS.includes(value)) throw new Error("TPDF_AGENT_PROVIDER must be dify, claude, codex or gemini.");
  return value;
}

export function timeoutMs(env = process.env) {
  const value = Number(env.TPDF_AGENT_TIMEOUT_MS || 90_000);
  if (!Number.isInteger(value) || value < 5_000 || value > 300_000) {
    throw new Error("TPDF_AGENT_TIMEOUT_MS must be between 5000 and 300000.");
  }
  return value;
}

export function validateDecision(value) {
  let data = value;
  if (typeof data === "string") {
    let text = data.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1].trim();
    data = JSON.parse(text);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Model must return a single JSON action object.");
  }
  const action = data.action;
  if (action === "discover" && typeof data.query === "string" && data.query.trim()) {
    return { action, query: data.query.slice(0, 300) };
  }
  if (action === "execute" && typeof data.tool === "string" && /^[a-z][a-z0-9-]{0,100}$/.test(data.tool)) {
    if (data.args !== undefined && (!data.args || typeof data.args !== "object" || Array.isArray(data.args))) {
      throw new Error("Model tool arguments must be an object.");
    }
    const args = data.args ?? {};
    if (Object.hasOwn(args, "confirmed") || Object.hasOwn(args, "approval")) {
      throw new Error("Model cannot authorize its own tool execution.");
    }
    if (JSON.stringify(args).length > 12_000) throw new Error("Model tool arguments are too large.");
    return { action, tool: data.tool, args };
  }
  if ((action === "ask" || action === "finish") && typeof data.message === "string" && data.message.trim()) {
    return { action, message: data.message.slice(0, 3000) };
  }
  throw new Error("Invalid model action; expected discover, execute, ask or finish.");
}

export function extractCliAnswer(provider, stdout) {
  if (!stdout.trim()) throw new Error("AI CLI returned no output.");
  if (provider === "codex") {
    let answer = "";
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === "item.completed" && event.item?.type === "agent_message" &&
          typeof event.item.text === "string") answer = event.item.text;
      if (event.type === "error" || event.type === "turn.failed") {
        throw new Error("Codex reported a failed turn.");
      }
    }
    if (!answer) throw new Error("Codex returned no final agent message.");
    return answer;
  }
  let data;
  try { data = JSON.parse(stdout); } catch { throw new Error("CLI returned invalid JSON output."); }
  if (provider === "claude" && !data.is_error && typeof data.result === "string") return data.result;
  if (provider === "gemini" && !data.error && typeof data.response === "string") return data.response;
  throw new Error("CLI returned an error or missing answer.");
}

export function cliInvocation(provider, env = process.env, platform = process.platform) {
  if (!["claude", "codex", "gemini"].includes(provider)) throw new Error("Unsupported CLI provider.");
  if (provider === "gemini" && env.TPDF_AGENT_GEMINI_SANDBOX_ACK !== "1") {
    throw new Error("Gemini requires TPDF_AGENT_GEMINI_SANDBOX_ACK=1 after sandbox verification.");
  }
  const bin = String(env["TPDF_AGENT_" + provider.toUpperCase() + "_BIN"] ||
    (platform === "win32" ? provider + ".cmd" : provider));
  if (!bin || /[\r\n]/.test(bin)) throw new Error("Invalid CLI executable.");
  const args = provider === "codex"
    ? ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--json", "-"]
    : provider === "claude"
      ? ["-p", "--tools", "", "--no-session-persistence", "--output-format", "json"]
      : ["-p", "", "--sandbox", "--approval-mode", "default", "--output-format", "json"];
  return { bin, args };
}

export function processInvocation(invocation, platform = process.platform) {
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(invocation.bin)) {
    // Only fixed flags and a locally configured binary are passed to cmd. Prompts go to stdin.
    const quote = (value) => '"' + String(value).replace(/"/g, '""').replace(/%/g, "%%") + '"';
    return { file: "cmd.exe", args: ["/d", "/s", "/c", quote(invocation.bin) +
      " " + invocation.args.map(quote).join(" ")] };
  }
  return { file: invocation.bin, args: invocation.args };
}

export async function invokeCli(provider, prompt, options = {}) {
  const env = options.env || process.env;
  const invocation = cliInvocation(provider, env, options.platform || process.platform);
  const command = processInvocation(invocation, options.platform || process.platform);
  const cwd = await mkdtemp(join(tmpdir(), "tpdf-ai-planner-"));
  try {
    const stdout = await new Promise((resolve, reject) => {
      if (options.signal?.aborted) { reject(new Error("AI task cancelled.")); return; }
      let child;
      try {
        child = (options.spawnProcess || spawn)(command.file, command.args, {
          cwd, shell: false, windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...env, CI: "1", NO_COLOR: "1", TERM: "dumb" },
        });
      } catch (error) { reject(error); return; }
      let settled = false;
      let output = "";
      let stderr = "";
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancel);
        error ? reject(error) : resolve(value);
      };
      const kill = () => { try { child.kill("SIGKILL"); } catch { /* already exited */ } };
      const cancel = () => { kill(); finish(new Error("AI task cancelled.")); };
      const timer = setTimeout(() => {
        kill();
        finish(new Error("AI CLI exceeded its timeout of " + timeoutMs(env) + "ms."));
      }, timeoutMs(env));
      options.signal?.addEventListener("abort", cancel, { once: true });
      child.on("error", (error) => finish(error));
      child.stdout.on("data", (chunk) => {
        output += chunk.toString("utf8");
        if (output.length > MAX_OUTPUT) { kill(); finish(new Error("AI CLI output too large.")); }
      });
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
      child.on("close", (code) => {
        if (code !== 0) return finish(new Error(provider + " CLI exit " + code +
          (stderr ? ": " + stderr.slice(-400) : "")));
        finish(null, output);
      });
      child.stdin.on("error", (error) => { if (error.code !== "EPIPE") finish(error); });
      child.stdin.end(prompt);
    });
    return extractCliAnswer(provider, stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runModelDecision(prompt, options = {}) {
  const env = options.env || process.env;
  const provider = providerName(env);
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT) {
    throw new Error("Model prompt must be between 1 and " + MAX_PROMPT + " characters.");
  }
  let answer;
  if (provider === "dify") {
    const base = String(env.TPDF_DIFY_URL || "").replace(/\/$/, "");
    const key = String(env.TPDF_DIFY_API_KEY || "");
    if (!base || !key) throw new Error("Set TPDF_DIFY_URL and TPDF_DIFY_API_KEY.");
    const url = new URL(base);
    if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))) {
      throw new Error("Dify URL must use HTTPS or local HTTP.");
    }
    const signal = AbortSignal.any([
      AbortSignal.timeout(timeoutMs(env)), ...(options.signal ? [options.signal] : []),
    ]);
    const response = await (options.fetchImpl || fetch)(base + "/chat-messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: {}, query: prompt, user: "tpdf-agent-worker", response_mode: "blocking" }),
      signal,
    });
    if (!response.ok) throw new Error("Dify HTTP " + response.status);
    const raw = await response.text();
    if (raw.length > MAX_OUTPUT) throw new Error("Dify response exceeded output limit.");
    const data = JSON.parse(raw);
    if (typeof data.answer !== "string") throw new Error("Dify returned no answer.");
    answer = data.answer;
  } else {
    answer = await invokeCli(provider, prompt, options);
  }
  if (answer.length > MAX_DECISION) throw new Error("AI decision too large.");
  return { answer: JSON.stringify(validateDecision(answer)) };
}
