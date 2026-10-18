# TPDF AI CLI Worker

The worker uses Dify (default), Claude Code CLI, Codex CLI, or Gemini CLI to produce a single structured JSON decision. All PDF changes continue through TPDF's authenticated, approval-aware native tool harness. This is NOT a general-purpose shell agent or sandbox for arbitrary file modification.

## Setup

Use Node.js 22 or newer, run TPDF Server and start pairing in the authenticated AI panel. Install and authenticate your chosen CLI separately, or use a Dify Chatflow application key. Configure these variables on the worker host:

- TPDF_SERVER_URL: HTTPS TPDF server URL (localhost HTTP allowed)
- TPDF_AGENT_PROVIDER: dify, claude, codex or gemini
- TPDF_DIFY_URL and TPDF_DIFY_API_KEY: required for dify
- TPDF_AGENT_TIMEOUT_MS: optional, default 90000 (range 5000–300000)
- TPDF_AGENT_TOKEN_FILE: optional pairing token location
- TPDF_AGENT_CLAUDE_BIN, TPDF_AGENT_CODEX_BIN, TPDF_AGENT_GEMINI_BIN: optional executable paths
- TPDF_AGENT_GEMINI_SANDBOX_ACK=1: required after verifying Gemini sandbox protection

Run:

```bash
node scripts/tpdf-agent-worker.mjs doctor
node scripts/tpdf-agent-worker.mjs pair YOUR_PAIR_CODE
node scripts/tpdf-agent-worker.mjs start
```

## Security and limitations

CLI model requests use a temporary working directory with constant flags. Claude built-in tools are disabled; Codex uses a read-only sandbox; Gemini requires an explicit sandbox acknowledgement. Prompts are written to stdin, never appended to command flags. This is not an OS isolation guarantee: provider authentication and network permissions still apply. Use an isolated OS account and verify each provider's installed CLI version and sandbox semantics.

The worker validates a single JSON object with action discover, execute, ask or finish, and strips model-provided approval fields. Destructive PDF operations always require UI confirmation. The server task broker currently stores tasks in memory; model-process cancellation happens on lease renewal or shutdown and is not instantaneous. No remote arbitrary shell access or headless native PDF mutation is enabled.

## Validation

```bash
node --test tests/cli/agent-provider.test.mjs
npm run test:cli
npm run typecheck
```

Tests mock provider output. Live CLI login, authenticated end-to-end document edits, Windows .cmd launch, and deployment smoke checks remain mandatory before production rollout.

## Web AI workspace and provider routing

Open the gear icon in the AI panel, pair a worker, and select a provider advertised by an online worker. Auto selects an available machine. Each worker currently advertises one provider; run separate paired processes for different providers.

The server persists machine pairing, tasks, and project-scoped task history in TPDF_DATA_DIR/agent-state.json. Back it up with its matching pairing secret; never publish this file.

After server restart, running jobs are safely requeued and can invoke a model again. Native PDF actions only execute in the authenticated browser and are never replayed automatically from the queue.

The current persistence is local-file based and supports one server process only. Multiple server nodes need a transactional shared queue before production use.

The browser polls a model decision for up to six minutes; individual provider calls default to 90 seconds. Live Windows process launching and authenticated end-to-end tests remain outstanding.