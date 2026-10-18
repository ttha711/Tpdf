# AI execution regression contract

This follow-up to PR #220 fixes the concrete invariants reproduced against commit
`3be2bde7731aea34347f69c9ce7c5e9c00ac3f2b`. It does not assert production readiness.

## Behavior

- The host checks the document snapshot before model planning and again before execution.
- A successful host tool advances the checkpoint revision, including approved tools. This
  permits subsequent valid approvals after the agent's own edit. External revision changes
  while awaiting input or approval still stop the run.
- The execution ledger persists independently of the last 20 conversational observations.
  A failed operation is resolved only by a success with the same tool, canonical arguments,
  document identity and pre-action revision. A different successful tool cannot clear it.
- Unknown tools create unresolved ledger entries. Correcting an unknown operation to a
  different tool does not silently count as the same task; the user can start a new request.
- `finish` is an execution result, not a wording heuristic. Without a completed tool entry,
  or while an operation remains unresolved, it returns `failed` with a host-written message.
  Use `ask` for missing information or unsupported capabilities.
- Legacy unresolved checkpoints without operation metadata fail closed. Start a fresh job.
- A failed operation that changes the document revision is not automatically retried.

## AI patch contract (desktop and network)

Both paths use the same validator. An `error` value other than null, `success: false`,
`ok: false`, or an error/failed/cancelled status takes precedence over any updates.
Nested data/result/response envelopes are inspected as well.

A valid response must contain a non-empty `updates` array. IDs must be unique and belong
to the selected blocks (or the available blocks when there is no selection). Block types,
text lengths and complete style objects are checked. Free-form message/answer text is no
longer guessed to be a replacement: that fallback could overwrite a document with an error.
Providers relying on that fallback must return the structured patch format, for example:

```json
{"updates":[{"id":"block_1","content":"Replacement text","html":"<p>Replacement text</p>"}]}
```

## Run the regression tests

With the repository dependencies installed and Node 22:

```sh
node --test tests/ai/*.test.cjs
```

The tests transpile the actual checked-out TypeScript modules with the installed TypeScript.
React hooks, Express transport, model output and OCR engine calls are explicit test doubles.
These tests are NOT a whole-app typecheck, browser E2E or a live model/OCR integration test.
The AI regression workflow runs independently of the larger CI workflow on relevant PRs.
The existing full CI, typecheck, build and browser gates remain required.

## TLS reverse proxy configuration

Set the browser-visible origin on the editor server when HTTPS terminates before Node:

```sh
TPDF_EDITOR_PUBLIC_ORIGIN=https://editor.example.com
```

Use the exact scheme and hostname. The browser-facing deployment must use HTTPS for
production secure cookies. Requests from other origins remain rejected. The regression
case that supplies forwarded headers without this configuration is intentionally rejected;
forwarded headers alone are not a trust boundary.

## Remaining validation and limits

The ledger verifies reported tool outcomes, not the semantic completeness of an arbitrary
natural-language goal or every PDF engine's on-disk postconditions. Omitting a requested
step from the model plan still needs a host-validated plan/acceptance contract. Document
identity checks use the identity supplied by the adapter and fall back to fileName in older
adapters; revisions remain essential. In-flight native edits are not transactional and
cannot always be cancelled/rolled back. Live Dify/CLI, real PDF/OCR output, full app builds,
HTTPS browser sessions and production integration tests remain separate requirements.
