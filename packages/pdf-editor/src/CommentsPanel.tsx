import { useState } from "react";
import type { P4Comments } from "./useP4Comments.js";
import type { CommentView } from "./p4Types.js";

const when = (iso: string) => { const time = Date.parse(iso); return Number.isFinite(time) ? new Date(time).toLocaleString() : ""; };

function Thread({ item, number, c, selected, onSelect }: { item: CommentView; number: number; c: P4Comments; selected: boolean; onSelect(): void }) {
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const { caps } = c;
  const row = (id: string, author: string, at: string, text: string, canEdit: boolean, canDelete: boolean, unsaved?: boolean) => <div className="tpdf-comment-row" key={id}>
    <div className="tpdf-comment-meta"><strong>{author}</strong><span>{unsaved ? "Not saved yet" : when(at)}</span></div>
    {editing?.id === id
      ? <div className="tpdf-comment-edit"><textarea aria-label="Edit comment" value={editing.text} maxLength={5000} onChange={(e) => setEditing({ id, text: e.target.value })} />
        <button type="button" disabled={!editing.text.trim()} onClick={() => { c.edit(id, editing.text); setEditing(null); }}>Save</button>
        <button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
      : <p className="tpdf-comment-text">{text}</p>}
    {!unsaved && editing?.id !== id && <div className="tpdf-comment-actions">
      {canEdit && caps.edit && <button type="button" onClick={() => setEditing({ id, text })}>Edit</button>}
      {canDelete && caps.delete && <button type="button" onClick={() => c.remove(id)}>Delete</button>}</div>}
  </div>;
  return <article className={"tpdf-comment" + (selected ? " is-selected" : "") + (item.status === "resolved" ? " is-resolved" : "")} data-comment-id={item.id}>
    <button type="button" className="tpdf-comment-head" onClick={onSelect} aria-label={`Show comment ${number} on page ${item.page}`}>
      <span className="tpdf-comment-badge">{number}</span><span>Page {item.page}</span>{item.status === "resolved" && <em>Resolved</em>}</button>
    {row(item.id, item.author.name, item.createdAt, item.text, item.canEdit, item.canDelete, item.unsaved)}
    {item.replies.map((r) => <div className="tpdf-comment-reply" key={r.id}>{row(r.id, r.author.name, r.createdAt, r.text, r.canEdit, r.canDelete, r.unsaved)}</div>)}
    {!item.unsaved && <div className="tpdf-comment-foot">
      {caps.resolve && <button type="button" onClick={() => c.resolve(item.id, item.status !== "resolved")}>{item.status === "resolved" ? "Reopen" : "Resolve"}</button>}
      {caps.reply && <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { c.reply(item.id, reply); setReply(""); } }}>
        <input aria-label="Reply" value={reply} maxLength={5000} placeholder="Reply" onChange={(e) => setReply(e.target.value)} />
        <button type="submit" disabled={!reply.trim()}>Send</button></form>}
    </div>}
  </article>;
}

/** Comments of the document: filter by page and state, open one to jump to its pin, reply, edit, resolve and delete (all staged until Save). */
export function CommentsPanel({ c, page, selectedId, onSelect }: { c: P4Comments; page: number; selectedId: string | null; onSelect(item: CommentView): void }) {
  const [scope, setScope] = useState<"all" | "page">("all");
  const [state, setState] = useState<"all" | "open" | "resolved">("all");
  if (!c.supported) return <p className="tpdf-comments-empty">Comments need a host that can read them from the PDF.</p>;
  const numbered = c.view.map((item, index) => ({ item, number: index + 1 }));
  const shown = numbered.filter(({ item }) => (scope === "all" || item.page === page) && (state === "all" || item.status === state));
  return <div className="tpdf-comments">
    <div className="tpdf-comments-filters">
      <select aria-label="Comment pages" value={scope} onChange={(e) => setScope(e.target.value as "all" | "page")}><option value="all">All pages</option><option value="page">This page</option></select>
      <select aria-label="Comment state" value={state} onChange={(e) => setState(e.target.value as "all" | "open" | "resolved")}><option value="all">All</option><option value="open">Open</option><option value="resolved">Resolved</option></select>
      <button type="button" onClick={() => void c.refresh()} disabled={c.loading}>{c.loading ? "Loading…" : "Refresh"}</button></div>
    {c.failed && <p role="alert" className="tpdf-comments-error">{c.failed}</p>}
    {!c.caps.add && <p className="tpdf-comments-note">Adding comments is not enabled for this document.</p>}
    {c.canAnnotate && <p className="tpdf-comments-note">Choose Comment in Annotate, then tap the page.</p>}
    {!shown.length && !c.loading && <p className="tpdf-comments-empty">No comments.</p>}
    {shown.map(({ item, number }) => <Thread key={item.id} item={item} number={number} c={c} selected={selectedId === item.id} onSelect={() => onSelect(item)} />)}
  </div>;
}
