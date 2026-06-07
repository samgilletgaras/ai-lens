# GitHub Copilot (VS Code) provider

This is the global reference for the **GitHub Copilot for VS Code** provider in
Lens: where VS Code keeps Copilot's data on disk, how Lens discovers workspaces and
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

Skills are the exception — they live outside VS Code at `~/.copilot/skills/`.

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

---

## Where each feature's data comes from

### Sessions, messages, logs — `ghcopilot-vscode-sessions.js` / `-logs.js`
Sessions are discovered from `transcripts/`, but the transcript **drops the opening
user prompt** (and some turns), so user turns are sourced from the sibling
`chatSessions/<id>.jsonl` and merged with the transcript's assistant/tool turns by
timestamp. This is the subject of the [detail page](session-storage.md). Logs
stream the transcript events as raw `{ project, session, lineNumber, raw }` envelopes.

### Stats — `ghcopilot-vscode-stats.js`
Streams transcripts and counts sessions, messages (`user.message` +
`assistant.message`), tool calls (from `assistant.message.data.toolRequests[]`), an
activity-by-day map, and top tools/projects. **Token totals and cost are 0** — the
transcript carries no usage data, so the token/cost/model/hook fields are reported
empty (the shape matches the Claude stats contract).

### Skills — `ghcopilot-vscode-skills.js`
Reads `~/.copilot/skills/<slug>/SKILL.md` (the GitHub Copilot CLI's skills dir,
**not** inside VS Code). Description/trigger from frontmatter (or first non-heading
line). No usage scan (`totalCalls: 0`).

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
files are collected recursively.

### Plans — provider-agnostic
Plans are not a Copilot concept; the shared `readers/plans.js` ignores the provider
param. (The `hasPlans` capability gates the nav item.)

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
