import type { AgentCommand, AgentCommandResult, AgentToolDefinition } from "./types";
import {
  acceptScope, completionProblem, isExpectedScope, operationKey, readHarnessScope,
  recordExecution, sameHarnessScope, type ExecutionRecord, type HarnessScope,
} from "./harnessLedger";
import { buildHarnessPrompt, discoverTools, parseDecision, type Decision } from "./harnessProtocol";
export { discoverTools, parseDecision } from "./harnessProtocol";

export type HarnessObservation = { action: string; detail: string; result: unknown };
export type HarnessCheckpoint = {
  goal: string;
  observations: HarnessObservation[];
  pending?: AgentCommand;
  discoveredTools?: Array<{ id: string; description: string; requiredArgs: string[]; optionalArgs: string[]; risk: string }>;
  awaitingInput?: string;
  documentRevision?: string;
  documentIdentity?: string;
  hasDocument?: boolean;
  executions?: ExecutionRecord[];
  unresolvedFailure?: boolean;
};
export type HarnessOutcome = {
  status: "completed" | "confirmation_required" | "input_required" | "failed";
  message: string;
  checkpoint: HarnessCheckpoint;
};
export type HarnessEvent = { action: string; message: string };
export type HarnessAdapter = {
  model: (prompt: string) => Promise<unknown>;
  execute: (command: AgentCommand) => Promise<AgentCommandResult>;
  listTools: () => AgentToolDefinition[];
  getState: () => unknown;
  onEvent?: (event: HarnessEvent) => void;
  isCancelled?: () => boolean;
};
const MAX_STEPS = 12;
const MAX_OBSERVATIONS = 20;
const MAX_EXECUTIONS = 100;

export async function runAgentHarness(
  checkpoint: HarnessCheckpoint, adapter: HarnessAdapter, approval?: "approve" | "reject",
): Promise<HarnessOutcome> {
  const outcome = (status: HarnessOutcome["status"], message: string): HarnessOutcome => ({ status, message, checkpoint });
  const tools = adapter.listTools();
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const observe = (action: string, detail: string, result: unknown) => {
    checkpoint.observations.push({ action, detail, result });
    if (checkpoint.observations.length > MAX_OBSERVATIONS) checkpoint.observations.shift();
    adapter.onEvent?.({ action, message: detail });
  };
  const currentScope = () => readHarnessScope(adapter.getState());
  const initial = currentScope();
  if (!isExpectedScope(checkpoint, initial)) return outcome("failed", "Document changed since the agent planned its actions.");
  acceptScope(checkpoint, initial);
  // A legacy flag lacks the arguments needed to prove a retry resolved it. Do not erase it.
  if (checkpoint.unresolvedFailure && !checkpoint.executions?.length) {
    checkpoint.executions = [{ key: "legacy-failure", tool: "legacy-action", status: "failed", attempts: 1 }];
  }

  const execute = async (command: AgentCommand, planned: HarnessScope): Promise<AgentCommandResult> => {
    if (adapter.isCancelled?.()) return { status: "failed", tool: command.tool, message: "Stopped before tool execution." };
    if (!sameHarnessScope(planned, currentScope())) {
      return { status: "failed", tool: command.tool, message: "Document changed before tool execution." };
    }
    const key = operationKey(command.tool, command.args ?? {}, planned);
    let result: AgentCommandResult;
    try { result = await adapter.execute(command); }
    catch (error) { result = { status: "failed", tool: command.tool, message: String(error) }; }
    const after = currentScope();
    const transition = command.tool === "open-file" || command.tool === "close-document";
    const differentDocument = after.documentIdentity !== planned.documentIdentity || after.hasDocument !== planned.hasDocument;
    if ((differentDocument && !transition) || (result.status !== "completed" && !sameHarnessScope(planned, after))) {
      result = { status: "failed", tool: command.tool,
        message: "Document changed during an unsuccessful or unrelated operation. Review the PDF before retrying." };
    } else if (result.status === "completed") {
      // Advance only after our own successful action, including the human-approval path.
      acceptScope(checkpoint, after);
    }
    recordExecution(checkpoint, key, command.tool, result);
    observe("execute", command.tool, { ...result, documentState: adapter.getState() });
    return result;
  };

  const pause = (command: AgentCommand, result: AgentCommandResult): HarnessOutcome | null => {
    if (result.status === "confirmation_required") {
      checkpoint.pending = structuredClone(command);
      return outcome("confirmation_required", result.confirmationPrompt || result.message);
    }
    if (result.status === "input_required") {
      checkpoint.awaitingInput = result.message;
      return outcome("input_required", result.message);
    }
    return null;
  };

  if (adapter.isCancelled?.()) return outcome("failed", "Stopped before the next action.");
  if (checkpoint.pending) {
    const pending = checkpoint.pending;
    checkpoint.pending = undefined;
    if (approval !== "approve") {
      observe("rejected", pending.tool, { status: "declined" });
      return outcome("failed", "Action cancelled by user.");
    }
    if (!byId.has(pending.tool) || (pending.expectedRevision !== undefined && pending.expectedRevision !== initial.documentRevision)) {
      return outcome("failed", "The approved action is no longer valid for this document.");
    }
    const approved = await execute({ ...pending, confirmed: true }, initial);
    const paused = pause(pending, approved);
    if (paused) return paused;
    if (approved.status !== "completed") return outcome("failed", approved.message);
  }

  let invalid = 0;
  let failed = 0;
  for (let index = 0; index < MAX_STEPS; index++) {
    if (adapter.isCancelled?.()) return outcome("failed", "Stopped before the next step. Completed edits are not automatically undone.");
    if ((checkpoint.executions?.length ?? 0) >= MAX_EXECUTIONS) return outcome("failed", "Agent execution budget reached.");
    const planningState = adapter.getState();
    const planned = readHarnessScope(planningState);
    if (!isExpectedScope(checkpoint, planned)) return outcome("failed", "Document changed between agent steps.");
    let decision: Decision;
    try {
      const response = await adapter.model(buildHarnessPrompt(checkpoint, tools, planningState));
      if (!sameHarnessScope(planned, currentScope())) return outcome("failed", "Document changed while the AI was planning; no action executed.");
      decision = parseDecision(response);
      invalid = 0;
    } catch (error) {
      observe("model_error", "Invalid structured model response", String(error));
      if (++invalid >= 2) return outcome("failed", "AI model did not return valid structured actions.");
      continue;
    }
    if (adapter.isCancelled?.()) return outcome("failed", "Stopped after model response; no further steps will start.");

    if (decision.action === "finish") {
      const lastAttempt = [...checkpoint.observations].reverse().find((row) => row.action === "execute");
      const lastStatus = (lastAttempt?.result as { status?: string } | undefined)?.status;
      const problem = completionProblem(checkpoint) ||
        (lastAttempt && lastStatus !== "completed" ? "The last PDF action did not complete." : null);
      if (problem) {
        observe("unverified_finish", "Completion requires successful execution evidence", problem);
        return outcome("failed", problem);
      }
      return outcome("completed", decision.message);
    }
    if (decision.action === "ask") {
      checkpoint.awaitingInput = decision.message;
      return outcome("input_required", decision.message);
    }
    if (decision.action === "discover") {
      const found = discoverTools(tools, decision.query);
      checkpoint.discoveredTools = found;
      observe("discover", decision.query, found.length ? found : { note: "No matching native tool available." });
      continue;
    }

    const tool = byId.get(decision.tool as AgentToolDefinition["id"]);
    if (!tool) {
      const result = { status: "unavailable" as const, message: "Requested tool is not registered." };
      recordExecution(checkpoint, operationKey(decision.tool, decision.args ?? {}, planned), decision.tool, result);
      observe("tool_unavailable", decision.tool, result);
      if (++failed >= 3) return outcome("failed", result.message);
      continue;
    }
    const command: AgentCommand = {
      tool: tool.id, args: decision.args ?? {},
      expectedRevision: tool.requiresDocument ? planned.documentRevision : undefined,
      confirmed: false, // Only the explicit human approval branch above may set true.
    };
    const result = await execute(command, planned);
    const paused = pause(command, result);
    if (paused) return paused;
    if (result.status === "failed" || result.status === "unavailable") {
      if (++failed >= 3) return outcome("failed", result.message);
    } else {
      failed = 0;
    }
  }
  return outcome("failed", "Agent reached its bounded step budget without a verified completion.");
}
