# GitHub Copilot CLI provider

This is the global reference for the **GitHub Copilot CLI** provider in AI Lens:
where the CLI stores its data on disk, how AI Lens discovers sessions and projects,
and where each feature the app shows comes from.

> **This is a separate provider from `ghcopilot-vscode`.** The CLI is a standalone
> terminal tool (`gh copilot` / `copilot` binary) that stores its history in
> `~/.copilot/session-state/` — completely separate from VS Code's `workspaceStorage`.

---

## Storage layout

Everything lives under `~/.copilot/`:

```
~/.copilot/
├── session-state/
│   ├── <sessionId>.jsonl          ← flat event log (older / aborted sessions)
│   └── <sessionId>/               ← session directory (newer sessions)
│       ├── events.jsonl           ← primary event log (takes precedence over flat .jsonl)
│       ├── workspace.yaml         ← project metadata: cwd, git_root, branch, name
│       ├── vscode.metadata.json   ← present when launched from VS Code terminal
│       ├── checkpoints/           ← checkpoint snapshots
│       ├── files/                 ← tracked file state
│       └── research/              ← research artifacts
├── session-store.db               ← SQLite cross-session index (out of scope — not readable under Node-core-only constraint)
├── agents/                        ← user custom agents (*.agent.md)
├── skills/                        ← CLI personal skills (<slug>/SKILL.md)
├── copilot-instructions.md        ← global instructions applied to every session
├── mcp-config.json                ← user-level MCP servers ({ servers: {…} })
├── settings.json                  ← user preferences
└── vscode.session.metadata.cache.json  ← VS Code cache of CLI sessions started from its terminal (metadata only)
```

---

## Session discovery and project resolution

`scanSessionsUncached()` walks `~/.copilot/session-state/` and collects:
- **Flat `.jsonl` files**: `<id>.jsonl` at the root — older or short-lived sessions.
- **Session directories**: `<id>/` — newer sessions that may have `events.jsonl`
  and/or `workspace.yaml`.

When both a flat `.jsonl` and a `<id>/events.jsonl` exist for the same session,
the directory's `events.jsonl` takes precedence (it is the primary log for newer
sessions that have checkpoints and other artifacts).

**Project ID** is resolved in order:
1. `workspace.yaml` → `git_root` or `cwd` field.
2. `session.info { infoType: "folder_trust" }` event in the JSONL — the message
   contains the trusted folder path.
3. Fallback: `"Global"` (sessions with no workspace context).

Project resolution is cached per session ID after the first read.

---

## Event format and normalized contract

The CLI uses a rich event log compared to VS Code Copilot Chat. Every line is a
JSON object with `{ type, data, id, timestamp, parentId }`.

| CLI event type | Normalized role | Notes |
|---|---|---|
| `session.start` | `system` | Includes `copilotVersion` |
| `session.info` | `system` | MCP connections, auth, folder trust |
| `user.message` | `user` | Has `attachments` array |
| `assistant.message` (content) | `assistant` | |
| `assistant.message` (toolRequests) | `tool_use` | `toolCallId` → `id` |
| `tool.execution_complete` | **`tool_result`** | Full result content + `isError` flag |
| `tool.execution_start` | — | Skipped — redundant with `toolRequests` |
| `abort` | — | Skipped |

**`tool_result` is the key addition over the VS Code provider**, which never
persists tool outputs on disk.

---

## Where each feature's data comes from

### Sessions, messages, logs — `ghcopilot-cli-sessions.js` / `-logs.js`
Sessions discovered from `~/.copilot/session-state/`. Flat `.jsonl` or
`<id>/events.jsonl` as the event log. Project resolved from `workspace.yaml`
or `session.info` events. Full normalized event contract including `tool_result`.

### Stats — `ghcopilot-cli-stats.js`
Streams event logs and counts sessions, messages, tool calls, activity by day.
`models` is populated from `session.start.data.modelId` when present. Token
counts are not stored in the JSONL — all token fields remain 0.

### Skills — `ghcopilot-cli-skills.js`
Reads from `~/.copilot/skills/` (CLI-specific) and `~/.agents/skills/` (open
standard, shared with VS Code Copilot). Same `SKILL.md` structure as the VS Code
provider. Note: skills in `~/.agents/skills/` will appear under both the VS Code
and CLI providers since both tools read from that directory.

### Agents — `ghcopilot-cli-agents.js`
Scans `~/.copilot/agents/*.agent.md`. Same `.agent.md` frontmatter format as
VS Code Copilot Chat.

### MCP servers — `ghcopilot-cli-mcps.js`
Reads `~/.copilot/mcp-config.json` (`{ servers: { name: { command, args, url } } }`).
Config-only — no usage or tool-call history derived. Server ids use the `cli:`
prefix to distinguish them from VS Code workspace/global servers.

### Memory — `ghcopilot-cli-memory.js`
Surfaces `~/.copilot/copilot-instructions.md` as a single memory entry under the
`"Copilot CLI Global"` project. This is the user-editable global instructions file
applied to every CLI session. Per-project `.github/copilot-instructions.md` files
live inside project repos and are out of scope (no hardcoded paths).

### Plans — not supported
The CLI has no plans feature equivalent. `hasPlans: false` in capabilities.

---

## Caveats

- `session-store.db` (SQLite) powers `/chronicle` cross-session queries but is
  **out of scope** under the Node-core-only constraint (no `better-sqlite3`).
- The JSONL format is undocumented and unofficial; it may change between CLI
  versions. Readers parse only narrow slices and skip malformed lines.
- Sessions launched from VS Code's integrated terminal get a `vscode.metadata.json`
  inside their dir, but the full conversation data still lives in the CLI JSONL —
  not in VS Code's `workspaceStorage`. These sessions appear under the CLI provider,
  not the VS Code provider.
- Token counts are not stored in the event log — all token fields are 0.
