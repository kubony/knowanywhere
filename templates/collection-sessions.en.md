# Template: `<Agent> Sessions` collection overview (en)

`kna-08-collections` takes only the text between the `kna:overview:start` and `kna:overview:end` markers in
this file and sets it as the description of the `{{AGENT_NAME}} Sessions` collection. Two placeholders are
replaced first.

| placeholder | value | example |
|---|---|---|
| `{{AGENT_NAME}}` | `agent.name` from state | `Rosé` |
| `{{SHARED_COLLECTION}}` | name of the shared collection | `Shared Knowledge` |

Angle-bracket items such as `<task summary>`, `<time>` and `<machine>` are part of the rules and stay as they are.
The Korean version is `collection-sessions.ko.md`.

<!-- kna:overview:start -->
This collection is the work log of **{{AGENT_NAME}}**. Only {{AGENT_NAME}} writes here. Other agents and people only read.
This description is the source of truth. {{AGENT_NAME}} reads it before the first write of every session and follows it where other instructions differ.

## One document per task

- **One document per task.** When the session or the machine changes but the task is the same, do not create a new document: find the existing one and continue it.
- **Search before creating.** Search this collection for the task's key words (MCP `list_documents` with `query` and this collection's `collectionId`). Create a document only when nothing matches. Duplicates are not allowed.
- **Title**: `YYYY-MM-DD · <task summary>`. The date is the local date the task started; it does not change when the task runs for several days. This collection is sorted by title, descending, so recent work is on top.
- **icon**: put one emoji for the topic in the document's `icon` field, not in the title or the body.
- **Flat**: no nested documents. Link related tasks to each other instead.
- **Main session only.** When running as a subagent or worker spawned by another session, do not write here; report the result to the session that spawned you.

## Document skeleton

```
Author: {{AGENT_NAME}} · Status: 🟡 in progress
Started: 2026-09-15 14:05 KST · Last updated: 2026-09-15 16:40 KST

## Background
Why this task exists and what was given.

## Done when
What must be true for the task to be finished, and how to check it (command, expected output, numbers).

## Update — 2026-09-15 16:40 KST · laptop
What was done, what was learned, what is blocked, what is next.

## Completion record
The result and the evidence for it.

Last updated: {{AGENT_NAME}} · 2026-09-15 16:40 KST
```

- The `Author:` line with the status, the started and last-updated times, `## Background` and `## Done when` are written when the document is created.
- Append one `## Update — <time> · <machine>` per meaningful milestone, change of direction or blocker. `<machine>` is the short host name (`hostname -s`). Do not rewrite earlier Updates.
- `## Completion record` is written when the task ends. Without evidence it is not a completion record.
- The last line, `Last updated: {{AGENT_NAME}} · <time>`, changes on every write. Times include the time zone.

## Status

| mark | meaning |
|---|---|
| ⚪ waiting | not started, or waiting for the user or for another task. Say what it waits for |
| 🟡 in progress | being worked on |
| 🔴 blocked | cannot proceed for an outside reason. Say what blocks it and what would unblock it |
| ✅ done | the done-when conditions were actually checked, and the evidence is in `## Completion record` |
| ⚫ cancelled | decided not to do it. Say why |

A command that ended with exit code 0 and a goal that was reached are different states. Do not switch to ✅ before the done-when conditions were checked.

## When to write

- When a task starts: create the document, or append a resume Update to the existing one and set the status to 🟡.
- While working: append an Update at every meaningful milestone, change of direction or blocker.
- When it ends: write `## Completion record`, then update the status and the last-updated line.
- Small talk, quick questions and simple lookups need no document. Record work that has a goal, spans several steps, or whose result someone will look for later.

## Leave evidence

Keep numbers, absolute paths, commit hashes, commands with their output, and links as they are. Instead of "works" or "improved", write what was checked and how. Mark anything not checked as "unverified".

## Editing

- **Prefer partial edits.** Do not rewrite a whole document. Use `update_document` with `editMode: "append"` for additions and `editMode: "patch"` to change one passage. Full replacement (`"replace"`) can lose formatting.
- When changing text that is already there (anything other than appending), end the changed paragraph with `(Edited by: <name> · <time>)`. The same applies when the user asked for the change.

## The signature is the only authorship record

The wiki API records the creator (createdBy) as the owner of the login or API token. Several agents write with the same account, so that field cannot tell who wrote what. The `Author:` line and the `Last updated:` footer are the only authorship record. Never omit them.

## Never record secrets

No API keys, tokens, passwords, OAuth client secrets or private keys. Write the storage path, the variable name and at most the last 4 characters. Example: `GOOGLE_CLIENT_SECRET` in `/opt/outline/.env` (last 4: `a1b2`). Check command output for secrets before pasting it.

## Shared knowledge does not go here

Durable facts learned while working (the user's preferences, project summaries, conventions, decisions) are not piled up here. Distill them into `{{SHARED_COLLECTION}}` and link to that document from here.
<!-- kna:overview:end -->
