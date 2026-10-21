import { createContext, useContext } from "react";
import type { CommentView } from "./p4Types.js";

export interface CommentPinsState { comments: CommentView[]; selectedId: string | null; onPin(id: string): void }
export const CommentPinsContext = createContext<CommentPinsState | null>(null);

/** Note pins of the comments of one page, drawn at their displayed-page percentages. */
export function CommentPins({ page }: { page: number }) {
  const state = useContext(CommentPinsContext);
  if (!state) return null;
  const mine = state.comments.map((item, index) => ({ item, index })).filter(({ item }) => item.page === page);
  return <>{mine.map(({ item, index }) =>
    <button key={item.id} type="button" className={"tpdf-comment-pin" + (item.status === "resolved" ? " is-resolved" : "") + (item.unsaved ? " is-unsaved" : "") + (state.selectedId === item.id ? " is-selected" : "")}
      style={{ left: item.point.x + "%", top: item.point.y + "%" }} aria-label={"Comment " + (index + 1)}
      onPointerDown={(event) => event.stopPropagation()} onClick={() => state.onPin(item.id)}>{index + 1}</button>)}</>;
}
