export type PdfCommentPoint = { x: number; y: number };
export type PdfCommentReply = { id: string; author: { name: string }; createdAt: string; modifiedAt?: string; text: string; canEdit: boolean; canDelete: boolean };
export type PdfComment = {
  id: string; page: number; point: PdfCommentPoint; annotationId?: string; author: { name: string };
  createdAt: string; modifiedAt?: string; text: string; status: "open" | "resolved";
  replies: PdfCommentReply[]; canEdit: boolean; canDelete: boolean;
};
export type P4Change =
  | { kind: "comment.add"; schemaVersion: 1; tempId: string; page: number; point: PdfCommentPoint; text: string; annotationId?: string }
  | { kind: "comment.reply"; schemaVersion: 1; tempId?: string; parentId: string; text: string }
  | { kind: "comment.edit"; schemaVersion: 1; id: string; text: string }
  | { kind: "comment.resolve"; schemaVersion: 1; id: string; resolved: boolean }
  | { kind: "comment.delete"; schemaVersion: 1; id: string };
export type CommentCapabilities = { add: boolean; reply: boolean; edit: boolean; resolve: boolean; delete: boolean; onAnnotations: boolean };
export const NO_COMMENT_CAPS: CommentCapabilities = { add: false, reply: false, edit: false, resolve: false, delete: false, onAnnotations: false };

export interface CommentReplyView extends PdfCommentReply { unsaved?: boolean }
export interface CommentView extends Omit<PdfComment, "replies"> { unsaved?: boolean; replies: CommentReplyView[] }

const YOU = { name: "You" };

/** The saved comments with the staged (not yet saved) comment changes laid over them, in order. */
export function mergeStaged(base: PdfComment[], staged: P4Change[]): CommentView[] {
  const list: CommentView[] = base.map((item) => ({ ...item, replies: item.replies.map((reply) => ({ ...reply })) }));
  const root = (id: string) => list.find((item) => item.id === id);
  for (const change of staged) {
    if (change.kind === "comment.add") {
      list.push({ id: change.tempId, page: change.page, point: change.point, author: YOU, createdAt: "", text: change.text, status: "open", replies: [], canEdit: false, canDelete: false, unsaved: true });
    } else if (change.kind === "comment.reply") {
      root(change.parentId)?.replies.push({ id: change.tempId || `new-${list.length}-${Math.random().toString(36).slice(2, 7)}`, author: YOU, createdAt: "", text: change.text, canEdit: false, canDelete: false, unsaved: true });
    } else if (change.kind === "comment.resolve") {
      const target = root(change.id);
      if (target) target.status = change.resolved ? "resolved" : "open";
    } else if (change.kind === "comment.edit") {
      const target = root(change.id);
      if (target) target.text = change.text;
      else for (const item of list) { const reply = item.replies.find((r) => r.id === change.id); if (reply) reply.text = change.text; }
    } else if (change.kind === "comment.delete") {
      const index = list.findIndex((item) => item.id === change.id);
      if (index >= 0) list.splice(index, 1);
      else for (const item of list) item.replies = item.replies.filter((reply) => reply.id !== change.id);
    }
  }
  return list;
}

export const isP4Change = (change: { kind: string }): change is P4Change => change.kind.startsWith("comment.");
