# Claude Code provider

This is the global reference for the **Claude Code** provider in AI Lens: where Claude
Code keeps its data on disk, the per-session transcript format, and exactly where
each feature the app shows (projects, messages, logs, stats, skills, agents, MCPs,
memory, plans) comes from.

Verified against a real `~/.claude/` (Linux). Paths are derived in code from
`os.homedir()` — nothing is hardcoded. The reader implementations live in
`src/api/readers/claude/` and the path constants in `src/api/utils.js`.
Endpoint/architecture overview: `docs/README.md`.

---

## TL;DR

Everything lives under **`~/.claude/`**. The heart of it is
**`~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl`** — one
append-only JSONL file per session, one JSON object per line. Sessions, messages,
logs, and stats are all derived by streaming those JSONL files. Skills, agents,
plans, memory, and MCP configs are separate files/dirs under `~/.claude/`.

The transcript is the single source of truth — there is no second store.

---

## The `~/.claude/` directory

Path constants (`src/api/utils.js`):

```
~/.claude/                                  CLAUDE_DIR
├── projects/                               PROJECTS_DIR   ← sessions, logs, stats, memory, usage
│   └── <encoded-project-path>/
│       ├── <session-uuid>.jsonl            ← one session transcript
│       └── memory/*.md                     ← per-project memory files
├── skills/<slug>/SKILL.md                  SKILLS_DIR
├── agents/**/*.md                          AGENTS_DIR     (recursive)
├── plans/*.md                              PLANS_DIR
├── plugins/marketplaces/claude-plugins-official/external_plugins/
│   └── <dir>/.mcp.json                     MCP_PLUGINS_DIR ← MCP server configs
└── mcp-needs-auth-cache.json               ← MCP auth status (used by mcps reader)
```

AI Lens reads **only** the paths above. Other entries (`backups/`, `cache/`,
`history.jsonl`, `shell-snapshots/`, `settings.json`, `.credentials.json`, …) are
intentionally ignored.

### Project directory naming

A project's absolute path is encoded by replacing `/` with `-`:

```
/home/sam/Documents/claude-lens   →   -home-sam-Documents-claude-lens
```

The reader uses this encoded directory name **as the project id** verbatim. The
frontend's `prettifyProjectName()` turns it back into something readable. Any
directory whose name contains `tmp` (`isTmp`) is skipped.

---

## The session JSONL format

Each `<session-uuid>.jsonl` is append-only, one JSON object per line. Every line is
an **envelope** with shared metadata plus a `type`. Observed top-level keys:

```jsonc
// type === "user"
{ "type":"user", "timestamp":"…", "uuid":"…", "parentUuid":"…",
  "sessionId":"…", "cwd":"…", "gitBranch":"…", "version":"…",
  "promptId":"…", "promptSource":"…", "permissionMode":"…",
  "isSidechain":false, "userType":"…", "message": { "content": … } }

// type === "assistant"
{ "type":"assistant", "timestamp":"…", "uuid":"…", "parentUuid":"…",
  "requestId":"…", "sessionId":"…", "cwd":"…", "gitBranch":"…",
  "message": { "model":"…", "stop_reason":"…", "usage": {…}, "content": [...] } }
```

### `type` values seen in real files

The reader handles the message-bearing ones and ignores the rest:

| `type` | Used by AI Lens? | Meaning |
|--------|---------------|---------|
| `user` | ✅ message + turn count + tokens preview | a user turn (`message.content`: string or content blocks) |
| `assistant` | ✅ message + tokens + tools + models | an assistant turn (`message.content`: blocks; `message.usage`; `message.model`) |
| `attachment` | ✅ system event + hook stats | tool results, hook outcomes (`attachment.type` e.g. `hook_success`/`hook_failure`) |
| `system` | ✅ system event | system notices (`content`) |
| `ai-title` | ❌ | auto-generated session title |
| `mode` / `permission-mode` | ❌ | mode-change markers |
| `last-prompt` | ❌ | bookkeeping |
| `file-history-snapshot` | ❌ | editor file-history snapshot |

### Message content shapes

- **User** `message.content` is **either** a plain string **or** an array of blocks
  (`{type:"text"}`, `{type:"tool_result"}`, …). The session preview skips strings
  starting with `<` (injected XML/command wrappers) and skips tool-result-only
  arrays so the preview reflects real user prose.
- **Assistant** `message.content` is an array of blocks; `{type:"tool_use", name,
  input}` blocks are how tool calls (incl. `Skill` and `mcp__…` calls) are recorded.

### Token usage (`assistant.message.usage`)

Real keys include `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens` (plus extras like `service_tier`, `speed` that AI Lens
ignores). Cost is estimated via `MODEL_PRICING` in `utils.js`, keyed by a substring
match on `message.model` (default `[3, 15]` $/M in/out if unknown).

---

## Where each feature's data comes from

### Projects — `claude-sessions.js : getProjects`
Lists subdirectories of `PROJECTS_DIR` (skipping `tmp`); `sessionCount` = number of
`*.jsonl` files; `lastUpdated` = newest file mtime.

### Sessions list — `claude-sessions.js : getSessions`
Streams each `*.jsonl` once to compute `firstMessageTs`, `lastUpdated`, a `preview`
(first real user prose), `turnCount` (user turns), and per-session token totals.
**Cache key = file names + mtimes** (re-reads only when a file changes).

### Messages — `claude-sessions.js : getMessages`
Streams one session file and **flattens** each line into the normalized message contract (see `docs/README.md`). Each Anthropic content block becomes its own event:

- `user` lines: `tool_result` blocks → `{ role: 'tool_result' }` events; text blocks are parsed for Claude slash-command XML tags (`<command-name>`, `<local-command-caveat>`, `<command-args>`, `<command-message>`) and emitted as `{ role: 'local_command' }` + `{ role: 'user' }`.
- `assistant` lines: `thinking` blocks → `{ role: 'thinking' }`; `text` blocks → `{ role: 'assistant' }`; `tool_use` blocks → `{ role: 'tool_use' }`.
- `attachment` lines → `{ role: 'system_attachment' }` (hook events, tool outputs).
- `system` lines → `{ role: 'system' }`.

Claude Code produces the richest event timeline: thinking, tool calls, tool results, hook events, system notices, and slash-command metadata are all present on disk and faithfully surfaced. Cached by file mtime.

### Logs — `claude-logs.js : getLogs`
Streams **every** session file across all projects and emits raw line envelopes
`{ project, session, lineNumber, raw }`, sorted by `raw.timestamp` desc. 60s TTL cache.

### Stats — `claude-stats.js : getStats`
Global or per-project. Streams session files and aggregates: message/tool counts,
token totals + cache-hit rate, model and stop-reason distributions, **hook**
success/failure + avg duration (from `attachment.type === "hook_success"/"hook_failure"`),
top projects/tools, and an activity-by-day map (keyed `YYYY-MM-DD` from each
session's last timestamp) for the heatmap. Estimated cost via `MODEL_PRICING`.

### Skills — `claude-skills.js`
Definitions: each subdir of `~/.claude/skills/` with a `SKILL.md`; description/trigger
from YAML frontmatter (or first non-heading line). Usage: scans all session JSONL for
`tool_use` blocks named `Skill`, counting calls and last-used per `input.skill` slug.

### Agents — `claude-agents.js`
**Recursively** scans `~/.claude/agents/**/*.md`. Each `.md` is an agent; `name`/
`description` from frontmatter (slug + first line fallback). `lastUsed` = file mtime
(no usage scan). First slug wins on duplicates (by slug derived from filename, not
full path — so `agents/foo.md` and `agents/sub/foo.md` collide on slug `foo`; the
shallower one wins because directory entries are processed first).

### MCP servers — `claude-mcps.js`
Configs: `~/.claude/plugins/.../external_plugins/<dir>/.mcp.json` (`mcpServers`).
Each `.mcp.json` can use either the flat `{ mcpServers: { id: { command, args } } }`
schema or the nested `{ plugins: [{ mcp: { … } }] }` plugin-manifest schema; the reader
handles both and merges them under a unified server id. Usage: scans all session JSONL
for `tool_use` blocks named `mcp__<server>__<tool>`, counting per server + per tool.
Auth status from `~/.claude/mcp-needs-auth-cache.json`. Servers prefixed `claude_ai_`
are typed `cloud`, others `plugin`.

### Memory — `claude-memory.js`
Reads `~/.claude/projects/<proj>/memory/*.md` (per project). Parses frontmatter
(`name`, `description`, `type`) plus indented `key: value` lines; `MEMORY.md` is the
index. Grouped under the same project id as that project's sessions.

### Plans — `readers/claude/claude-plans.js`
Reads `~/.claude/plans/*.md`, sorted by mtime desc. Title from frontmatter `name`
or first `#` heading; snippet from first real content line. Registers into the
`readers/plans.js` hub under the `claude` id, like every other Claude reader — so
plans dispatch by provider and fan out under the `all` meta-provider (Claude is the
only provider with `hasPlans` today). The hub itself (`readers/plans.js`) is
provider-agnostic.

---

## Caching

Two patterns (see top-level `CLAUDE.md` "Architecture"):

- **mtime-keyed** — `claude-sessions.js` and per-project stats re-read only when the
  relevant files change (cache key = file names + mtimes). Best for hot, stable data.
- **60s TTL** (`CACHE_TTL`) — logs, global stats, skill/MCP usage scans, memory,
  agents. Simpler; tolerates slight staleness on expensive full scans.

---

## Caveats

- The JSONL format is **unofficial** and can change between Claude Code versions;
  the reader tolerates unknown `type` values and malformed lines (skips them).
- Figures/keys above are from one machine and illustrate the *shape*, not fixed values.
- **Local-files-only** holds throughout — everything is read off disk, no network.
