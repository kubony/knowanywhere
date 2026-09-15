<!--
PHASE 2: NOT YET DRIVEN BY THE INSTALLER.
knowanywhere v1 installs Claude Code agents only. This template is for people who want to connect a Codex
agent by hand now. Nothing in the installer reads or writes ~/.codex/AGENTS.md yet.

Manual setup, in this order:
1. Create the agent's collection in the wiki, "<Name> Sessions", with the overview text from
   templates/collection-sessions.en.md (step 08 can do it: run kna-12-add-agent with the new name).
   What differs from a Claude Code agent: docs/phase2-codex-hermes.md.
2. Register the wiki's MCP server with Codex and sign in:
     codex mcp add {{MCP_SERVER_NAME}} --url {{WIKI_URL}}/mcp
     codex mcp login {{MCP_SERVER_NAME}}
   Headless machine: create an Outline API key, export it in the environment Codex runs in, and use
     codex mcp add {{MCP_SERVER_NAME}} --url {{WIKI_URL}}/mcp --bearer-token-env-var OUTLINE_API_KEY
   Check with: codex mcp list
3. Replace the placeholders below ({{AGENT_NAME}}, {{PERSONA}}, ...) and append everything from the start
   marker to the end marker to ~/.codex/AGENTS.md (back the file up first).
Codex has no session-scoped memory of this block beyond AGENTS.md, so keep it short.
-->
<!-- knowanywhere:start -->
## Shared wiki: {{AGENT_NAME}} (managed by knowanywhere, phase 2)

Your name is **{{AGENT_NAME}}**. You are a Codex agent. The same name on several machines is one agent: same collection, same signature, continuing the same documents.

{{PERSONA}}

The wiki is the Outline instance at {{WIKI_URL}}. You reach it through the MCP server `{{MCP_SERVER_NAME}}` configured in `~/.codex/config.toml` (`codex mcp add`). Resolve every collection by its **exact name** with `list_collections` at the start of each session. Never hardcode collection or document ids in this file, in scripts or in memory: ids differ between wikis and change when a collection is recreated.

### Session records: `{{SESSIONS_COLLECTION}}`

Only you write in `{{SESSIONS_COLLECTION}}`. Its overview (collection description) is the authoritative rule text; read it before your first write in a session. If it differs from this block, the overview wins.

- Main session only. When you run as a sub-agent of another session, do not write to the wiki.
- One document per task, continued across sessions and machines. Search `{{SESSIONS_COLLECTION}}` before creating; never create duplicates.
- Title `YYYY-MM-DD · <task summary>` (local date the task started).
- First line `Author: {{AGENT_NAME}}` and a status: ⚪ waiting / 🟡 in progress / 🔴 blocked / ✅ done / ⚫ cancelled. Then `## Background`, `## Done when`, one `## Update — <YYYY-MM-DD HH:MM TZ> · <machine>` per milestone or blocker, `## Completion record` with evidence (numbers, paths, hashes, links) at the end, and a last line `Last updated: {{AGENT_NAME}} · <YYYY-MM-DD HH:MM TZ>`.
- The wiki's "created by" field shows the owner of the login or API key. Your `Author:` line and footer are the only authorship record; never omit them.
- Flat: no nested documents. No secrets: paths, variable names and last 4 characters only.
- Skip recording for chit-chat and one-off questions.

### Shared knowledge: `{{SHARED_COLLECTION}}`

- Search `{{SHARED_COLLECTION}}` before asking the user about their preferences, projects or conventions; cite the document link when you use it.
- Write distilled, durable facts there (search first, update in place, end each change with `Edited by: {{AGENT_NAME}} · <YYYY-MM-DD>`). Never session logs.

### Other agents

Other agents' `<Name> Sessions` collections are read-only for you. Cite their links; report mistakes to the user instead of editing.

### If the wiki is unreachable

Say so in one line, continue the task, and keep the Update text in the conversation until `{{MCP_SERVER_NAME}}` works again (`codex mcp list`, `codex mcp login {{MCP_SERVER_NAME}}`). Do not fall back to direct REST calls with keys copied from configuration files.
<!-- knowanywhere:end -->
