import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfChange } from "./history.js";
import { isP4Change, mergeStaged, NO_COMMENT_CAPS, type CommentCapabilities, type CommentView, type P4Change, type PdfComment } from "./p4Types.js";
import type { TpdfPdfAdapter } from "./types.js";

const tempId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Saved comments from the host plus the comment changes staged in this session; every action is staged until Save. */
export function useP4Comments(input: { adapter: TpdfPdfAdapter; changes: PdfChange[]; canEdit: boolean; record: (change: PdfChange) => void; report: (code: string, error: unknown, retryable?: boolean) => void }) {
  const { adapter, changes, canEdit, record, report } = input;
  const reportRef = useRef(report);
  reportRef.current = report;
  const supported = Boolean(adapter.listComments);
  const [saved, setSaved] = useState<PdfComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const refresh = useCallback(() => {
    if (!adapter.listComments) return Promise.resolve();
    setLoading(true);
    return adapter.listComments().then((result) => { setSaved(result.comments); setFailed(""); })
      .catch((error) => { setFailed(error instanceof Error ? error.message : String(error)); reportRef.current("comments", error, true); })
      .finally(() => setLoading(false));
  }, [adapter]);
  useEffect(() => { void refresh(); }, [refresh]);
  const staged = useMemo(() => changes.filter(isP4Change), [changes]);
  const view: CommentView[] = useMemo(() => mergeStaged(saved, staged), [saved, staged]);
  const caps: CommentCapabilities = { ...NO_COMMENT_CAPS, ...(adapter.commentCapabilities || {}) };
  const stage = (change: P4Change) => { if (canEdit) record(change as unknown as PdfChange); };
  return {
    supported, loading, failed, view, caps, refresh, canAnnotate: canEdit && supported && caps.add,
    add: (page: number, point: { x: number; y: number }, text: string) => { const id = tempId(); stage({ kind: "comment.add", schemaVersion: 1, tempId: id, page, point, text: text.trim() }); return id; },
    reply: (parentId: string, text: string) => stage({ kind: "comment.reply", schemaVersion: 1, parentId, text: text.trim() }),
    edit: (id: string, text: string) => stage({ kind: "comment.edit", schemaVersion: 1, id, text: text.trim() }),
    resolve: (id: string, resolved: boolean) => stage({ kind: "comment.resolve", schemaVersion: 1, id, resolved }),
    remove: (id: string) => stage({ kind: "comment.delete", schemaVersion: 1, id }),
  };
}
export type P4Comments = ReturnType<typeof useP4Comments>;
