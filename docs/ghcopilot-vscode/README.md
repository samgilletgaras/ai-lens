# GitHub Copilot (VS Code) provider

This is the global reference for the **GitHub Copilot for VS Code** provider in
AI Lens: where VS Code keeps Copilot's data on disk, how AI Lens discovers workspaces and
sessions, and where each feature the app shows (projects, messages, logs, stats,
skills, agents, MCPs, memory) comes from.

Verified against a real install (Linux; VS Code stable, Copilot Chat `0.48.1`).
Paths are derived in code from `os.homedir()` / `os.platform()` — nothing is
hardcoded. The reader implementations live in `src/api/readers/ghcopilot-vscode/`.

> **Detail sub-page:** [`session-storage.md`](session-storage.md) — the two-file
> chat-storage model (`transcripts` vs `chatSessions`), why the first user message
> was missing, and the field-by-field trade-offs behind the sessions reader. Start
> here for the overview; go there for the deep dive.

---

## TL;DR

This provider is **VS Code only** (stable + Insiders). Everything lives under each
variant's **User** directory. The two anchors are:

- **`User/workspaceStorage/<hash>/`** — per-workspace data: chat sessions, MCP
  config, per-workspace memory. Each hash dir maps to a real project folder via its
  `workspace.json`.
- **`User/`** itself and **`User/globalStorage/`** — user-global data: custom +
  built-in agents, global MCP config, global memory.

Skills are the exception — they live outside VS Code, following the
[agentskills.io](https://agentskills.io) open standard: personal skills at
`~/.copilot/skills/` and `~/.agents/skills/`, workspace skills at
`.github/skills/`, `.agents/skills/`, or `.claude/skills/` inside each project.

---

## VS Code storage locations

Discovered in `ghcopilot-vscode-sessions.js` (`getCandidateDirs`, `getUserDirs`):

### Linux
```
$XDG_CONFIG_HOME/Code/User/                 (or ~/.config/Code/User/)
$XDG_CONFIG_HOME/Code - Insiders/User/
~/.vscode-server/data/User/                 (remote/server installs)
```

### macOS
```
~/Library/Application Support/Code/User/
~/Library/Application Support/Code - Insiders/User/
```

Windows is intentionally out of scope (`return []`).

> **Provider isolation:** only the VS Code app names above are scanned. Other
> editors that reuse VS Code's storage shape (Cursor, Windsurf, VSCodium) are **not**
> GitHub Copilot — by the architecture rules they each get their own provider, so
> they are deliberately excluded here.

The per-workspace tree under one `workspaceStorage/<hash>/`:

```
<hash>/
├── workspace.json                          ← { folder: "file:///abs/project/path" }
├── GitHub.copilot-chat/
│   ├── transcripts/<sessionId>.jsonl       ← Copilot extension transcript (lossy)
│   └── memory-tool/memories/**/*.md        ← per-workspace memory
└── chatSessions/<sessionId>.jsonl          ← VS Code core chat store (complete)
```

And user-global data under `User/`:

```
User/
├── prompts/*.agent.md                      ← user custom agents
├── mcp.json                                ← global MCP servers ({ servers: {…} })
└── globalStorage/github.copilot-chat/
    ├── <builtin-dirs>/*.agent.md           ← built-in agents (Ask, Explore, Plan, …)
    └── memory-tool/memories/**/*.md        ← global memory
```

### Workspace discovery → project ids

`scanWorkspaces()` walks every `workspaceStorage/<hash>/`, reads `workspace.json`,
and decodes its `folder` URI to the real absolute project path. **That decoded path
is the project id** (so a project keeps a stable id across VS Code variants). A
hash dir is only counted if it has both a `workspace.json` and a
`GitHub.copilot-chat/transcripts/` dir. Workspaces whose basename contains `tmp`
are skipped. If the same session id appears under multiple hashes, the newest mtime
wins.

Within each qualifying hash, after scanning the `transcripts/` folder the reader
also scans `chatSessions/` for any session IDs not already found in transcripts.
These **chatSessions-only** sessions are validated by a sync extensionId check
(`agent.extensionId.value === "GitHub.copilot-chat"`) before being included, since
`chatSessions` is VS Code core storage that other extensions could write to.
Sessions where no extensionId can be confirmed in the first 4 KB (empty or
abandoned sessions with no requests) are excluded.

---

## Where each feature's data comes from

### Sessions, messages, logs — `ghcopilot-vscode-sessions.js` / `-logs.js`
Sessions are discovered from `transcripts/`, supplemented by `chatSessions/` for
sessions that have no transcript file. Three producer formats exist:

- **Legacy** — transcript has `user.message` / `assistant.message` events; user
  turns are supplemented from the sibling `chatSessions/<id>.jsonl` (which includes
  the opening prompt the transcript drops).
- **Newer copilot-agent format** — transcript contains only `session.start`; the
  full conversation (user prompts + assistant responses) lives in `chatSessions`,
  sourced from `kind:2` request appends and `kind:1` result patches
  (`result.metadata.toolCallRounds`).
- **chatSessions-only** — no transcript file at all; the full conversation is read
  exclusively from `chatSessions/<id>.jsonl` using the same copilot-agent parsing
  path. These sessions are identified by extensionId filter during discovery.

Both flows merge into the same normalized message contract and sort chronologically.
See the [detail page](session-storage.md) for the field-by-field breakdown. Logs
stream transcript events as raw `{ project, session, lineNumber, raw }` envelopes.

All turns are **flattened**: text → `{ role: 'assistant' }`, tool calls →
`{ role: 'tool_use' }`, user prompts → `{ role: 'user' }`.

**Timeline richness** is limited by what VS Code stores in the transcript files. The following event types are **not stored on disk** and absent from the timeline:

- `tool_result` — tool outputs are not persisted (only the calls are)
- `thinking` — not supported
- `system_attachment` — no hook system
- `local_command` — no slash-command protocol
- `system` — no system-notice events in the transcript format

Token counts are also not stored per-message (only aggregate totals exist in `state.vscdb` as SQLite, which is out of scope under the Node-core-only constraint). The result is the sparsest timeline of the three providers: `user`, `assistant`, and `tool_use` events only.

### Stats — `ghcopilot-vscode-stats.js`
Streams transcripts and counts sessions, messages (`user.message` +
`assistant.message`), tool calls (from `assistant.message.data.toolRequests[]`), an
activity-by-day map (one count per session, keyed to the session's last message
timestamp — matching Claude/Cursor semantics), and top tools/projects. **`models` is populated** from
`chatSessions/*.jsonl` per-request `modelId` fields (e.g. `"copilot/claude-opus-4.5"`),
read alongside each transcript. **Token totals and cost remain 0** — individual token
counts are not stored in the transcript or chatSessions files (only aggregate totals
exist in `state.vscdb` as SQLite, which is out of scope under the Node-core-only
constraint). Hook fields are also reported empty.

> **Known gap:** sessions discovered exclusively from `chatSessions/` (no transcript
> file) are counted in the session total but contribute **0 messages and 0 tool calls**
> to aggregate stats, because the stats reader only streams transcript files. This
> produces a slight undercount for workspaces where the newer copilot-agent format
> stores all activity in `chatSessions` only.

### Skills — `ghcopilot-vscode-skills.js`
Follows the [agentskills.io](https://agentskills.io) open standard that VS Code
Copilot implements. Two scopes are merged, deduped by slug (first found wins):

**Personal skills** (checked in order):
- `~/.copilot/skills/<slug>/SKILL.md` — Copilot-specific personal skills
- `~/.agents/skills/<slug>/SKILL.md` — open-standard personal skills

**Workspace skills** (per project discovered by `scanWorkspaces()`):
- `<projectRoot>/.github/skills/<slug>/SKILL.md`
- `<projectRoot>/.agents/skills/<slug>/SKILL.md`
- `<projectRoot>/.claude/skills/<slug>/SKILL.md`

Description/trigger come from YAML frontmatter (or first non-heading body line).
No usage scan (`totalCalls: 0`).

### Agents — `ghcopilot-vscode-agents.js`
Across every VS Code variant's `User/` dir: user custom agents from
`User/prompts/*.agent.md`, plus built-in agents from
`User/globalStorage/github.copilot-chat/<dir>/*.agent.md`. Deduped by slug (first
wins). `lastUsed` = file mtime.

### MCP servers — `ghcopilot-vscode-mcps.js`
Two sources, merged: **global** servers from each variant's `User/mcp.json`
(`{ servers: {…} }`, id `global:<name>`), and **per-workspace** servers from each
project's `.vscode/mcp.json` (id `workspace:<ws>:<name>`). Config-only — no usage or
tool-call history is derived.

### Memory — `ghcopilot-vscode-memory.js`
VS Code Copilot Chat's "memory tool" markdown, two scopes: **global** under
`User/globalStorage/<ext>/memory-tool/memories/` (grouped under the project id
`Copilot Global`), and **per-workspace** under
`workspaceStorage/<hash>/<ext>/memory-tool/memories/` (grouped under the same
project id as that workspace's sessions). The extension folder casing differs by
scope (`GitHub.copilot-chat` vs `github.copilot-chat`), so both are probed; `.md`
files are collected recursively, **except** `plan*.md` (those belong to Plans, above).

### Plans — `ghcopilot-vscode-plans.js`
Copilot has **no dedicated plans store** like Claude's `~/.claude/plans/`. Instead the
built-in **Plan** agent persists the plan it produces through the *memory tool*, as a
markdown file named `plan*.md` under `<ext>/memory-tool/memories/`. Per-session plans
live in a memory dir named after the **base64-encoded session id** (so
`…/memories/<base64(sessionId)>/plan.md`); the reader decodes that back to the session
id to form a stable, friendly `filename`. Both scopes are scanned (global +
per-workspace), mirroring the memory reader. The source is the memory-tool tree, so
the memory reader **excludes** `plan*.md` (see below) to keep plans out of Memory and
avoid showing the same file in two places. (The `hasPlans` capability gates the nav
item.)

---

## Caching

All readers use the simple **60s TTL** pattern (`CACHE_TTL`). The sessions reader
additionally keys per-session message/summary caches and picks the newest file by
mtime when a session id is duplicated across workspace hashes.

---

## Caveats

- Both on-disk formats are **undocumented and unofficial**; they can change between
  VS Code / extension versions. Readers parse only narrow slices and skip malformed
  lines.
- Figures/versions above are from one machine and illustrate the *shape*, not fixed
  values.
- **Local-files-only** holds throughout — everything is read off disk, no network.
