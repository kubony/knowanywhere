# Template: shared collection overview and seed document (en)

`kna-08-collections` cuts this file into two parts.

- Between `kna:overview:start` and `kna:overview:end`: the description of the shared collection (default name
  `Shared Knowledge`; the Korean default is `공유 지식`).
- Between `kna:seed:start` and `kna:seed:end` ("Seed document"): the body of the first document in the shared
  collection, `00 · How agents use this wiki`.

Placeholders replaced first:

| placeholder | value | example |
|---|---|---|
| `{{SHARED_COLLECTION}}` | name of the shared collection | `Shared Knowledge` |
| `{{AGENT_NAME}}` | the agent creating the seed document (`agent.name` in state) | `Rosé` |
| `{{DATE}}` | the date the seed document is created, `YYYY-MM-DD` | `2026-09-15` |

Angle-bracket items such as `<agent>`, `<date>` and `<gist>` are part of the rules and stay as they are. Every agent
writes to this collection, so the overview names no particular agent. The Korean version is `collection-shared.ko.md`.

<!-- kna:overview:start -->
This collection is the shared knowledge that every agent and person using this wiki reads and writes. It holds distilled facts that stay true for a long time.
This description is the source of truth. Read it before writing here. An agent that is new to this wiki starts with `00 · How agents use this wiki`.

## What goes here

- **Facts about the user and their preferences**: how to address them, languages, tone, work habits, things they do not want.
- **Project summaries and current state**: purpose, repository location, deploy target, which agent usually works on it, the current state and the date it was checked.
- **Conventions**: commit messages, branches, code style, language of docs and comments.
- **Dated decisions**: what was decided, why, and which alternatives were considered.
- **Glossary**: domain terms, abbreviations, names of people and services.
- **Machines and environments**: host names, OS, role, which agents run there. No secrets.

## What does not go here

- **Session logs and progress notes.** What was done today, what is blocked, what is next: those go to each agent's `<agent> Sessions` collection.
- **Raw transcripts and long raw command output.** Extract the facts you need and link the session document that has the original.
- **Secrets.** Never write API keys, tokens, passwords, OAuth client secrets or private keys. Write the storage path, the variable name and at most the last 4 characters.

## Who writes

- Every agent and every person. Agents write from their main session only. When running as a subagent or worker, do not write here; report to the session that spawned you.
- Every change ends with a new line `Edited by: <agent> · <YYYY-MM-DD>` at the end of the document. Keep the earlier lines. The wiki's author field shows the account owner and cannot tell who made a change.
- **Prefer partial edits.** Do not rewrite a whole document; change only what changed (`update_document` with `editMode: "patch"` or `"append"`).

## How to read

- Before asking the user about preferences, projects or conventions, search this collection first (MCP `list_documents` with `query` and this collection's `collectionId`). If the answer is here, use it without asking.
- Cite the documents you relied on, as links.
- If the latest `Edited by` date is old, the fact may have changed. Confirm with the user before an important decision.

## Naming

- **Canonical documents** are topic documents that are kept and edited over time. Title `NN · topic`, with a two-digit number.
  Examples: `00 · How agents use this wiki`, `10 · User profile`, `20 · Project: knowanywhere`, `30 · Conventions`, `40 · Glossary`, `50 · Machines and environments`.
- **Decisions** get one document each, titled `YYYY-MM-DD · Decision: <gist>`. Example: `2026-09-15 · Decision: keep database dumps for 30 days`.
- Before creating a document, search for a canonical document on the same topic. If one exists, add to it. One document covers one topic.
- Keep it flat. No nested documents.
- Give each fact a source: a session document link, the date the user said it, a commit hash.

## Conflicts

- When two statements about the same fact differ, **the later date wins** (the decision date, or the date on the `Edited by` line).
- **Do not delete another agent's entries.** Strike the outdated entry through with ~~strikethrough~~ and put the new content with a note right after it. Note format: `(<YYYY-MM-DD> <agent>: why it changed, evidence link)`.
- When reversing a decision, do not delete the old decision document. Create a new decision document and put `Superseded by: <link to new document>` at the top of the old one.
- If you cannot tell which statement is right, do not edit: ask the user.
<!-- kna:overview:end -->

## Seed document

Title: `00 · How agents use this wiki` · icon: 🧭

<!-- kna:seed:start -->
This document is a map for agents and people who arrive at this wiki for the first time. The detailed rules are in each collection's description (overview). Where this document and a description differ, follow the description.

## What this wiki is

The place where several AI agents working for one person share memory. For example, Claude Code "Rosé" on a laptop, a desktop and Discord, Codex "Jisoo", and Hermes "Jennie" on a VM all read and write this wiki. One agent name running on several machines is still one agent. Agents connect through the wiki's MCP server (`/mcp`).

## Collection map

| collection | who writes | what |
|---|---|---|
| `<agent> Sessions` | that agent only | one document per task: background, done-when, progress Updates, completion record |
| `{{SHARED_COLLECTION}}` | everyone | distilled facts: user preferences, projects, conventions, decisions, glossary, machines |

## When a session starts

1. Read the description of your own `<agent> Sessions` collection and of `{{SHARED_COLLECTION}}`, once per session before the first write.
2. Search for documents related to the task: in your Sessions collection for the same task, in `{{SHARED_COLLECTION}}` for the user's preferences and the project's canonical document.
3. If a document for the same task exists, append a resume Update. Otherwise create one titled `YYYY-MM-DD · <task summary>`.

## Where to write

| what you learned | where it goes |
|---|---|
| what you did today, what is blocked, what is next | the task document in your Sessions collection (`## Update — <time> · <machine>`) |
| a preference the user stated (e.g. "commit messages in Korean") | a canonical document in `{{SHARED_COLLECTION}}` such as `10 · User profile` |
| a decision and its reason | `{{SHARED_COLLECTION}}`, as `YYYY-MM-DD · Decision: <gist>` |
| a new machine or service | `50 · Machines and environments` in `{{SHARED_COLLECTION}}` (no secrets) |
| a secret | nowhere. Storage path, variable name, last 4 characters only |

## Signatures

- Sessions documents: first line `Author: <agent>` with the status, last line `Last updated: <agent> · <time>`.
- `{{SHARED_COLLECTION}}` documents: every change adds `Edited by: <agent> · <date>` at the end.
- All agents connect with the same account, so the wiki's author field cannot tell who wrote what. The signature is the only authorship record.

## Other agents' records

Read and cite other agents' Sessions documents; do not edit them. If you find an error there, tell the user, or fix the shared fact in `{{SHARED_COLLECTION}}`.

## When the wiki is unreachable

If the MCP connection fails (expired login, wiki down), tell the user in one line and keep working. Keep the Update you meant to write in the conversation and write it when the connection is back. Do not work around it by taking tokens or keys from config files and calling the REST API.

## Adding an agent or a machine

Run the `kna-12-add-agent` step of the knowanywhere installer repository. A new agent gets its own `<name> Sessions` collection; a new machine for an existing agent reuses that agent's collection.

Edited by: {{AGENT_NAME}} · {{DATE}}
<!-- kna:seed:end -->
