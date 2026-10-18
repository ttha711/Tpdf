import type { AgentCommandResult } from "./types";

export type HarnessScope = {
  documentRevision?: string;
  documentIdentity?: string;
  hasDocument?: boolean;
};
export type ExecutionRecord = {
  key: string;
  tool: string;
  status: "completed" | "failed" | "unavailable";
  attempts: number;
};
export type ExecutionCheckpoint = HarnessScope & {
  executions?: ExecutionRecord[];
  /** Legacy checkpoint flag. Derived from the ledger for new runs. */
  unresolvedFailure?: boolean;
};

export function readHarnessScope(state: unknown): HarnessScope {
  const value = state && typeof state === "object" ? state as Record<string, unknown> : {};
  const identity = value.documentIdentity ?? value.documentId ?? value.sourceIdentity ?? value.fileName;
  return {
    documentRevision: typeof value.documentRevision === "string" ? value.documentRevision : undefined,
    documentIdentity: typeof identity === "string" ? identity : undefined,
    hasDocument: typeof value.hasDocument === "boolean" ? value.hasDocument : undefined,
  };
}

export function sameHarnessScope(left: HarnessScope, right: HarnessScope): boolean {
  return left.documentRevision === right.documentRevision &&
    left.documentIdentity === right.documentIdentity && left.hasDocument === right.hasDocument;
}

export function isExpectedScope(checkpoint: HarnessScope, current: HarnessScope): boolean {
  return (checkpoint.documentRevision === undefined || checkpoint.documentRevision === current.documentRevision) &&
    (checkpoint.documentIdentity === undefined || checkpoint.documentIdentity === current.documentIdentity) &&
    (checkpoint.hasDocument === undefined || checkpoint.hasDocument === current.hasDocument);
}

export function acceptScope(checkpoint: HarnessScope, current: HarnessScope): void {
  Object.assign(checkpoint, current);
}

/** Canonical JSON avoids treating a change in property order as a different retry. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 20) throw new Error("Tool arguments are too deeply nested.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((item) => canonical(item, depth + 1)).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key], depth + 1)).join(",") + "}";
  }
  throw new Error("Tool arguments must be finite JSON values.");
}

export function operationKey(tool: string, args: Record<string, unknown>, scope: HarnessScope): string {
  return canonical([tool, args, scope.documentIdentity ?? null, scope.documentRevision ?? null]);
}

export function recordExecution(
  checkpoint: ExecutionCheckpoint, key: string, tool: string, result: AgentCommandResult,
): void {
  if (result.status !== "completed" && result.status !== "failed" && result.status !== "unavailable") return;
  const rows = checkpoint.executions ??= [];
  // Only the exact failed operation on the same pre-action revision may be resolved.
  const previous = [...rows].reverse().find((row) => row.key === key && row.status !== "completed");
  if (previous) {
    previous.status = result.status;
    previous.attempts += 1;
  } else {
    rows.push({ key, tool, status: result.status, attempts: 1 });
  }
  checkpoint.unresolvedFailure = rows.some((row) => row.status !== "completed");
}

export function completionProblem(checkpoint: ExecutionCheckpoint): string | null {
  const rows = checkpoint.executions ?? [];
  if (checkpoint.unresolvedFailure || rows.some((row) => row.status !== "completed")) {
    return "Agent cannot finish: the last PDF action or an earlier requested operation did not complete.";
  }
  if (!rows.some((row) => row.status === "completed")) {
    return "No verified tool result is available. No document operation has been confirmed as completed.";
  }
  return null;
}
