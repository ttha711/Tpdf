# P4 Comments contract — approved design, docs only, no implementation

> Approval: 360i confirmed access-control rules, excluded notifications, and
> requires genuine PDF annotations visible in Acrobat/print/export where the
> reader shows PDF notes. **No package P4 UI/code or host backend is part of this PR.**

## Coordinates and data

Page numbers are 1-based. Point x/y are 0..100% of the **displayed,
rotated** page rectangle, origin top-left; host converts to PDF coordinates.
All timestamps are ISO 8601 UTC with timezone; host supplies author identity,
times and persisted IDs, never trusts values sent by clients. IDs are
document/version-scoped opaque nonempty strings; clients must not parse them.

```ts
type PdfCommentPoint = { x: number; y: number };
type PdfCommentAuthor = { name: string };
type PdfCommentReply = {
  id: string;
  author: PdfCommentAuthor;
  createdAt: string;
  modifiedAt?: string;
  text: string;
  canEdit: boolean;
  canDelete: boolean;
};
type PdfComment = {
  id: string;
  page: number;
  point: PdfCommentPoint;
  annotationId?: string;
  author: PdfCommentAuthor;
  createdAt: string;
  modifiedAt?: string;
  text: string;
  status: "open" | "resolved";
  replies: PdfCommentReply[];
  canEdit: boolean;
  canDelete: boolean;
};
type P4Change =
  | {kind:"comment.add";schemaVersion:1;tempId:string;
     page:number;point:PdfCommentPoint;text:string;annotationId?:string}
  | {kind:"comment.reply";schemaVersion:1;parentId:string;text:string}
  | {kind:"comment.edit";schemaVersion:1;id:string;text:string}
  | {kind:"comment.resolve";schemaVersion:1;id:string;resolved:boolean}
  | {kind:"comment.delete";schemaVersion:1;id:string};
type CommentCapabilities = {
  add:boolean; reply:boolean; edit:boolean; resolve:boolean;
  delete:boolean; onAnnotations:boolean;
};
adapter.listComments?():Promise<{versionId:string;comments:PdfComment[]}>;
adapter.commentCapabilities?:CommentCapabilities;
```

`P4Change` is added to the existing ordered `PdfChange[]` and sent via
`adapter.applyChanges(changes,info)`. No comment fields contain identity,
client timestamps or file bytes. Comment author, timestamps and final ID
are set by the authenticated 360i host. Text is plain text, not HTML;
the UI must never interpret comment bodies as markup.

## Order, temporary identities and server behavior

- A `comment.add` creates a client-only `tempId` that is unique **within
  the changes batch**. The host maps that temporary identity to the
  permanent PDF annotation identity.
- `comment.reply.parentId` can reference an existing persisted
  `PdfComment.id` **or a `tempId` from an earlier `comment.add`
  in the same ordered batch**. Forward references and duplicate temp IDs
  are errors. `comment.edit/resolve/delete.id` refers to a persisted
  comment/reply id, unless a future schema explicitly adds temp targets.
- Applying `comment.delete` to a root deletes the root and **all its
  replies**. Deleting a reply deletes only that reply.
- Host writes real PDF `/Text` annotation for root/reply; reply has
  `/IRT` referencing the root, state is stored using PDF `/State`.
  Saving creates a version following existing host `applyChanges`
  semantics; subsequent `listComments` rehydrates the PDF annotations.
- If `annotationId` is supplied, require
  `commentCapabilities.onAnnotations:true`, and host verifies that
  the target annotation belongs to the file/page and is accessible.

## Permissions — agreed by 360i

- Only the **author** may edit their own root comment or reply.
- **Author or board owner** may delete a root comment or reply.
- Anyone with **board write permission** may add, reply and change
  resolved state; host verifies rights for every operation at save time.
- `listComments()` returns **`canEdit` / `canDelete` per root and
  per reply** for the current viewer. The UI hides or disables actions
  when false, but these flags are only hints: the server **must**
  recheck permission, reject unauthorized operations with explicit
  errors, and never claim success.

## UI and capability rules for later P4 implementation

- Select Comment, tap PDF page, draw a note pin at its displayed %
  coordinate, enter plain-text body. Host `comment.add` is staged
  until Save; note pins and staged changes render on both tile/canvas.
- Comments panel: mobile bottom sheet, desktop sidebar; filter by
  page and open/resolved; select a comment to navigate to its page
  and point. Show reply thread, edit, delete and resolve only with
  capability + per-item permissions.
- If no `listComments`, **do not** fabricate a persisted thread.
  An empty/unsupported panel must explain that host support is needed.
  Reject stale `versionId` inventories rather than displaying
  comments from another document version.
- Missing `commentCapabilities` (or any false flag) defaults to
  disabled: **Coming soon / Sắp có** for Add, Reply, Edit, Resolve,
  Delete and On-annotation accordingly. The Comments navigation
  remains discoverable, but disabled operations must never pretend
  they ran. Host write access remains mandatory even when a flag is true.
- PDF notes are **real annotations**, visible on printing/export
  according to the viewer's note-rendering behavior. The package
  does not provide a print-visibility toggle in P4.
- **No notifications** (email, push, mentions or subscriptions) in P4.

## Validation and test matrix for implementation later

Check coordinate range and page boundaries, empty/oversize text,
duplicate IDs, forward temporary references, stale inventories,
reply-to-deleted-root, annotationId/version mismatch, permission
changes between load and Save, host failures and PDF persistence
including `/IRT` and `/State`. Ensure authorization failures
do not call onSaved or claim a saved version. Verify 375px mobile
bottom sheet and desktop sidebar in React StrictMode/tile-only and
canvas modes. Never access PDF.js in `tilesOnly`.

## Remaining conventions to confirm before P4 coding

- Maximum comment/reply text length (suggest 2000 Unicode code points).
- Whether `comment.edit` / `comment.delete` use the same `id`
  namespace for root and reply (recommended), and whether editing
  a reply can use `comment.edit`.
- Whether a reply is allowed against a resolved root, and whether
  changing resolved status also changes replies (recommend root only).

These are **minor validation conventions**, not a request to reopen
the three permission/notification/PDF storage decisions already agreed.
