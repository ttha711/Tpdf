import type { EditorBlock, LivePatch } from "./types";

type AiPatchRequest = {
  prompt: string;
  selectedBlocks: EditorBlock[];
  allBlocks: EditorBlock[];
  referenceImage: string | null;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** An error always wins over updates, for desktop and network responses alike. */
function assertSuccessfulEnvelope(value: unknown, depth = 0): void {
  if (!record(value)) return;
  if (depth > 4) throw new Error("AI response envelope is too deeply nested.");
  if ((Object.hasOwn(value, "error") && value.error !== null) || value.ok === false || value.success === false ||
      ["error", "failed", "cancelled"].includes(String(value.status).toLowerCase())) {
    throw new Error("AI provider reported a failure. No document changes were applied.");
  }
  for (const key of ["data", "result", "response"]) {
    if (record(value[key])) assertSuccessfulEnvelope(value[key], depth + 1);
  }
}

const validStyle = (value: unknown): boolean => {
  if (!record(value)) return false;
  return typeof value.font === "string" && value.font.length <= 200 &&
    typeof value.size === "number" && Number.isFinite(value.size) && value.size > 0 && value.size <= 512 &&
    typeof value.color === "string" && value.color.length <= 100 &&
    (value.lineHeight === undefined || (typeof value.lineHeight === "number" &&
      Number.isFinite(value.lineHeight) && value.lineHeight > 0 && value.lineHeight <= 10));
};

const isPatch = (value: unknown): value is LivePatch => {
  if (!record(value) || !Array.isArray(value.updates) || value.updates.length === 0 || value.updates.length > 300) return false;
  const ids = new Set<string>();
  let totalLength = 0;
  return value.updates.every((patch: unknown) => {
    if (!record(patch) || typeof patch.id !== "string" || !patch.id || patch.id.length > 200 || ids.has(patch.id)) return false;
    ids.add(patch.id);
    if (Object.keys(patch).some((key) => !["id", "html", "content", "style", "type"].includes(key))) return false;
    if (!["html", "content", "style", "type"].some((key) => Object.hasOwn(patch, key))) return false;
    if (patch.type !== undefined && !["paragraph", "heading", "list", "image", "table"].includes(String(patch.type))) return false;
    if (patch.style !== undefined && !validStyle(patch.style)) return false;
    for (const key of ["html", "content"]) {
      if (patch[key] !== undefined) {
        if (typeof patch[key] !== "string" || patch[key].length > 1_000_000) return false;
        totalLength += patch[key].length;
      }
    }
    return totalLength <= 2_000_000;
  });
};

export function validateAiPatch(payload: unknown, request: AiPatchRequest): LivePatch {
  assertSuccessfulEnvelope(payload);
  if (!isPatch(payload)) throw new Error("AI must return a non-empty structured updates array. No changes were applied.");
  const allowed = new Set((request.selectedBlocks.length ? request.selectedBlocks : request.allBlocks).map((block) => block.id));
  if (payload.updates.some((update) => !allowed.has(update.id))) {
    throw new Error("AI patch attempted to modify a block outside the allowed selection.");
  }
  // Do not pass through unrelated envelope properties to the editor.
  return { updates: payload.updates };
}

export async function generateAiPatch(request: AiPatchRequest): Promise<LivePatch> {
  if (window.tpdf?.applyAiPatch) {
    return validateAiPatch(await window.tpdf.applyAiPatch(request), request);
  }
  const endpoint = localStorage.getItem("tpdf-live-editor-ai-endpoint");
  if (!endpoint) throw new Error("AI endpoint is not configured. Connect an AI provider before applying AI changes.");
  const apiKey = localStorage.getItem("tpdf-live-editor-ai-key");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ ...request, output: "json_patch" }),
  });
  if (!res.ok) throw new Error(`AI endpoint failed: ${res.status}`);
  return validateAiPatch(await res.json(), request);
}
