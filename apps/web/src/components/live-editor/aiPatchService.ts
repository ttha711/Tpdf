import type { EditorBlock, LivePatch } from "./types";

type AiPatchRequest = {
  prompt: string;
  selectedBlocks: EditorBlock[];
  allBlocks: EditorBlock[];
  referenceImage: string | null;
};

const isPatch = (value: unknown): value is LivePatch => {
  if (!value || typeof value !== "object") return false;
  const updates = (value as { updates?: unknown }).updates;
  if (!Array.isArray(updates)) return false;
  return updates.length <= 300 && updates.every((item) => {
    if (!item || typeof item !== "object") return false;
    const patch = item as Record<string, unknown>;
    return typeof patch.id === "string" && patch.id.length > 0 && patch.id.length <= 200 &&
      (patch.html === undefined || (typeof patch.html === "string" && patch.html.length <= 1_000_000)) &&
      (patch.content === undefined || (typeof patch.content === "string" && patch.content.length <= 1_000_000));
  });
};

const ensurePatchTargets = (patch: LivePatch, request: AiPatchRequest): LivePatch => {
  const allowed = new Set((request.selectedBlocks.length > 0 ? request.selectedBlocks : request.allBlocks).map((block) => block.id));
  if (patch.updates.some((update) => !allowed.has(update.id))) {
    throw new Error("AI patch attempted to modify a block outside the allowed selection.");
  }
  return patch;
};

const tryBuildPatchFromLoosePayload = (payload: unknown, request: AiPatchRequest): LivePatch | null => {
  const selected = request.selectedBlocks.length > 0 ? request.selectedBlocks : request.allBlocks.slice(0, 1);
  const first = selected[0];
  if (!first) return null;

  const pickText = (obj: Record<string, unknown>): string | null => {
    const candidates = ["html", "content", "answer", "output", "message", "text"];
    for (const key of candidates) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  if (typeof payload === "string" && payload.trim()) {
    return { updates: [{ id: first.id, html: `<p>${payload.trim()}</p>`, content: payload.trim() }] };
  }
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.error !== undefined || root.success === false || root.ok === false) return null;

  const direct = pickText(root);
  if (direct) return { updates: [{ id: first.id, html: direct.includes("<") ? direct : `<p>${direct}</p>`, content: direct }] };

  const data = root.data;
  if (data && typeof data === "object") {
    if ((data as Record<string, unknown>).error !== undefined) return null;
    const fromData = pickText(data as Record<string, unknown>);
    if (fromData) return { updates: [{ id: first.id, html: fromData.includes("<") ? fromData : `<p>${fromData}</p>`, content: fromData }] };
  }

  return null;
};

export async function generateAiPatch(request: AiPatchRequest): Promise<LivePatch> {
  if (window.tpdf?.applyAiPatch) {
    const payload = await window.tpdf.applyAiPatch(request);
    if (!isPatch(payload)) {
      const loose = tryBuildPatchFromLoosePayload(payload, request);
      if (loose && isPatch(loose)) return ensurePatchTargets(loose, request);
      throw new Error("Desktop AI patch response is invalid.");
    }
    return ensurePatchTargets(payload, request);
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
  const payload: unknown = await res.json();
  if (!isPatch(payload)) {
    const loose = tryBuildPatchFromLoosePayload(payload, request);
    if (loose && isPatch(loose)) return ensurePatchTargets(loose, request);
    throw new Error("AI patch response is invalid.");
  }
  return ensurePatchTargets(payload, request);
}
