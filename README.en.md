# knowanywhere

[한국어](README.md) (the Korean README is the canonical version; this is a translation)

**How do my agents on different machines share what they know?**

You run Claude Code on a MacBook and on a desktop, maybe a Discord bot too, maybe Codex next month. Each one
starts every session with no memory of what the others did yesterday. Notes end up scattered across local files
that the other machines cannot see.

knowanywhere answers this with one self-hosted wiki and a short set of rules that every agent follows:

- **One [Outline](https://www.getoutline.com) wiki** on your own Google Cloud VM, behind HTTPS, with Google login.
- **One collection per agent** (`Rosé Sessions`), written only by that agent: one document per task, continued
  across sessions and machines. The agent searches before it creates, so Tuesday's MacBook session picks up
  Monday's desktop work.
- **One shared collection** (`Shared Knowledge`; `공유 지식` with the Korean templates) that every agent reads and writes, for durable facts: who you are,
  your projects, conventions, decisions. Session logs never go there; distilled knowledge does.
- **Every agent connects over MCP** to `https://<your-wiki>/mcp` and signs in with OAuth.
- **The rules live in the wiki**, in each collection's description (overview), and every agent reads them before
  writing. Change a rule once and every agent on every machine follows it.

This repository is an installer. Open it in Claude Code and it walks you through the whole setup, one step at a
time, asking before anything that costs money or touches your global Claude configuration.

```
  Rosé             Rosé             Rosé             Jisoo            Jennie
  Claude Code      Claude Code      Discord bot      Codex            Hermes
  MacBook          desktop          bridge           phase 2          phase 2, GCP VM
     |                |                |                |                |
     +----------------+--------+-------+----------------+----------------+
                               |  MCP over HTTPS (OAuth sign-in)
                               v
     +--------------------------------------------------------+
     |  Outline wiki   https://wiki.example.com               |
     |  on your own GCP VM, Google login only                 |
     |                                                        |
     |  Rosé Sessions      written only by Rosé               |
     |  Jisoo Sessions     written only by Jisoo              |
     |  Jennie Sessions    written only by Jennie             |
     |  Shared Knowledge   read and written by every agent    |
     +--------------------------------------------------------+
```

This is the author's own setup. Rosé runs under the same name on a MacBook, a desktop and Discord, and all three
write to the same `Rosé Sessions`. Jisoo (Codex) and Jennie (Hermes) each have their own collection. Adding a fourth
agent, Lisa, means running `kna-12-add-agent`, which creates one more collection, `Lisa Sessions`.

## Quick start

```bash
git clone https://github.com/kubony/knowanywhere.git
cd knowanywhere
claude
```

Claude reads [`AGENTS.md`](AGENTS.md), explains what will be built and what it costs, and asks whether to start the
install. Say yes. Stop whenever you like; reopening the repo resumes where you left off. Type `/kna-status` at any
time to see progress. The installer talks to you in the language you write in.

You need: a Google account and a card for the Google Cloud free trial, [Claude Code](https://claude.com/claude-code),
Node.js 20 or newer, git. The installer helps you install the Google Cloud CLI (`gcloud`). A domain is optional.

## What gets installed

On Google Cloud (`fresh` mode): a project with a budget alert, an e2-medium Debian 12 VM with a static IP, Docker,
Caddy (automatic HTTPS), Outline, Postgres and Redis, two private Cloud Storage buckets (uploads, backups), daily
disk snapshots and a nightly database dump.

On each machine: one MCP server entry in Claude Code (user scope) and one marked block in `~/.claude/CLAUDE.md`
with the agent's name and rules. Both are shown to you as a diff before they are written.

In the wiki: the `<Agent> Sessions` and `Shared Knowledge` collections with their rules, and a first document
written by your agent about this installation.

Details: [docs/architecture.md](docs/architecture.md) (Korean).

## Cost

| item | USD per month, approximate |
|---|---|
| Google Cloud free trial | $300 credit for 90 days, which covers the first three months |
| e2-medium VM, 24/7 | about 25 (us-central1) to 31 (asia-northeast3, Seoul) |
| disk, static IP, storage, snapshots, traffic | about 7 to 10 |
| **total after the trial** | **about 33 to 40** |
| domain (optional) | about $10 to $15 per year; without one you get a free `sslip.io` address |

Prices vary by region and change over time.

## Steps

The step guides under `docs/steps/` are in Korean.

| id | skill | what happens | fresh | join |
|---|---|---|---|---|
| 00 | `kna-00-start` | [consent, mode, agent name, template language, domain, prerequisite check](docs/steps/00-start.md) | yes | yes |
| 01 | `kna-01-gcp-account` | [GCP account and free credit, project, billing, APIs](docs/steps/01-gcp-account.md) | yes | |
| 02 | `kna-02-budget` | [monthly budget with email alerts](docs/steps/02-budget.md) | recommended | |
| 03 | `kna-03-vm` | [static IP, VM, firewall, swap, Docker](docs/steps/03-vm.md) | yes | |
| 04 | `kna-04-dns` | [`wiki.<domain>` A record, or an sslip.io name](docs/steps/04-dns.md) | yes | |
| 05 | `kna-05-google-oauth` | [Google login for the wiki](docs/steps/05-google-oauth.md) | yes | |
| 06 | `kna-06-outline-deploy` | [buckets, secrets, Outline + Caddy, first admin login](docs/steps/06-outline-deploy.md) | yes | |
| 07 | `kna-07-mcp-connect` | [connect Claude Code to the wiki over MCP](docs/steps/07-mcp-connect.md) | yes | yes |
| 08 | `kna-08-collections` | [Sessions and Shared Knowledge collections with rules](docs/steps/08-collections.md) | yes | yes |
| 09 | `kna-09-persona` | [agent persona and rules block, first session document](docs/steps/09-persona.md) | yes | yes |
| 10 | `kna-10-discord` | [optional Discord bot on the same wiki](docs/steps/10-discord.md) | optional | optional |
| 11 | `kna-11-backups` | [daily snapshots, nightly database dump, restore drill](docs/steps/11-backups.md) | yes | |
| 12 | `kna-12-add-agent` | [add another agent or machine](docs/steps/12-add-agent.md) | later | later |

## Joining another machine or agent

The wiki is built once. Every further machine only connects to it:

1. On the new machine: `git clone`, `cd knowanywhere`, `claude`, and answer `join` when asked for the mode.
2. Give the wiki URL, for example `https://wiki.example.com`.
3. Use the **same agent name** to continue as the same agent (Rosé on the desktop writes to the same
   `Rosé Sessions` as Rosé on the MacBook), or a **new name** to add another agent with its own collection.
4. The installer runs steps 07, 08 and 09 on that machine (and 10 if you want Discord).

To add an agent later from a machine that is already set up, run `kna-12-add-agent`.

## Phase 2: Codex and Hermes

v1 installs Claude Code agents and an optional Discord bridge. Rule templates for Codex (`AGENTS.md`) ship under
`templates/`, marked phase 2; a Codex agent such as Jisoo can already use them by hand if your Codex setup reaches
the wiki over MCP. Guided installers for Codex and Hermes agents are planned for a later version.

## Not in v1

Kubernetes, multi-tenant wikis, email (SMTP) invitations, and migrating existing notes. If you keep notes in an
Obsidian vault or plain Markdown, Outline can import Markdown files; try it on a copy after the install.

## Security in one paragraph

Login is Google OAuth only; there is no SMTP. The firewall opens TCP 80 and 443 for the wiki (SSH uses the default
rule with keys managed by gcloud). All secrets are created on the VM and kept in one file, `/opt/outline/.env`,
mode 600. The installer never prints a secret back, never writes one to its state file, to this repo, or to the
wiki, and refers to secrets only by variable name and last four characters. More in
[docs/architecture.md](docs/architecture.md) (Korean).

## Verification history

- 2026-09-15 · Steps 00 to 04 were run end to end through the installer on a new GCP project (Workspace account,
  Seoul region, sslip.io) and passed. Steps 05 to 11 have only had a local Docker smoke test (Outline 1.10.1 starts,
  `/_health` returns 200); they have not yet been run on real GCP.

## License

[MIT](LICENSE)
