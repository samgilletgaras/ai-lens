# Pi Provider

This is the global reference for the **Pi** provider in AI Lens: where Pi stores
its data on disk, the per-session JSONL tree format, and exactly where each
feature the app shows (projects, messages, logs, stats, skills, MCPs) comes from.

[Pi](https://pi.dev) (`@earendil-works/pi-coding-agent`) is a minimal terminal AI
coding agent harness. All session data is stored as plain JSONL on local disk — no
cloud backend. Paths are derived in code from `os.homedir()` — nothing is
hardcoded. The reader implementations will live in `src/api/readers/pi/` and the
provider declaration in `src/api/providers/pi.js`.

---

## TL;DR

Everything lives under **`~/.pi/agent/`**. The heart of it is
**`~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<uuid>.jsonl`** — one
append-only JSONL file per session, one JSON object per line, forming a **tree**
via `id`/`parentId` links. Sessions, messages, logs, and stats are all derived by
reading those JSONL files.

Key differentiators vs other providers:

- **Token usage and cost are stored per message** in every `AssistantMessage` —
  making Pi the second provider (after Claude Code) with real per-session cost data.
- **Tool results are persisted** (`toolResult` and `bashExecution` roles) — the
  timeline is richer than Cursor or GitHub Copilot.
- **Sessions are trees**, not linear lists — the reader must traverse from the
  active leaf to the root to reconstruct the conversation.
- MCP support is **optional** — it is provided by community extensions, so
  `~/.pi/agent/mcp.json` may not exist.

---

## Directory layout

```
~/.pi/agent/
├── sessions/
│   └── --<encoded-cwd>--/               # one dir per project (cwd encoded)
│       └── <timestamp>_<uuid>.jsonl     # one tree-JSONL per session
├── skills/
│   └── <skill-name>/
│       └── SKILL.md                     # YAML frontmatter + markdown body
├── extensions/                          # TypeScript extensions (not read by AI Lens)
├── git/                                 # git-installed packages  (not read)
├── npm/                                 # npm-installed packages  (not read)
├── settings.json                        # global settings
├── trust.json                           # trusted project folders (not read)
├── mcp.json                             # optional: community extension MCP config
└── mcp-cache.json                       # optional: MCP tool metadata cache

~/.agents/
└── skills/
    └── <skill-name>/
        └── SKILL.md                     # agentskills.io open standard (shared across editors)
```

AI Lens reads only `sessions/`, `skills/`, `mcp.json`, and `mcp-cache.json`.
All other entries (`extensions/`, `git/`, `npm/`, `settings.json`, `trust.json`,
…) are intentionally ignored.

---

## Project directory encoding

Pi encodes the working directory into a safe filesystem name by:

1. Stripping the leading `/` (or `\` on Windows, out of scope)
2. Replacing every `/` and `:` with `-`
3. Wrapping with a `--` prefix and `--` suffix

Examples:
```
/home/sam/Projects/foo   →   --home-sam-Projects-foo--
/home/sam/my-project     →   --home-sam-my-project--
```

This encoding is **lossless only when the path contains no hyphens in directory
names** (same limitation as Cursor slugs). However, unlike Cursor, **no
cross-reference is needed**: the `SessionHeader` on the first line of every
`.jsonl` file contains the real `cwd` field. The reader reads the header of any
session file in the directory to recover the canonical project path.

---

## Session JSONL format

Each `.jsonl` file contains two distinct structural layers.

### Layer 1 — Entry types (the tree spine)

Every line except the header extends `SessionEntryBase`:

```typescript
interface SessionEntryBase {
  type: string;
  id: string;           // 8-char hex
  parentId: string | null;
  timestamp: string;    // ISO 8601
}
```

The **first line** is always a `SessionHeader` (no `id`/`parentId`):

```json
{"type":"session","version":3,"id":"<uuid>","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/home/sam/Projects/foo"}
```

For forked sessions a `parentSession` field points to the source file path.

Entry types and how AI Lens uses them:

| `type` | AI Lens use | Notes |
|--------|-------------|-------|
| `"session"` | header metadata | First line only; `version`, `id`, `cwd`; no tree fields |
| `"message"` | messages, tokens, tools | Contains an `AgentMessage` in the `message` field |
| `"compaction"` | `system` event | Context compaction summary; fields: `summary`, `tokensBefore` |
| `"branch_summary"` | `system` event | Summary of an abandoned branch; fields: `summary`, `fromId` |
| `"model_change"` | `system` event | Model switch mid-session; fields: `provider`, `modelId` |
| `"session_info"` | session display name | Latest entry's `name` field used as session title |
| `"custom_message"` | `system` event | Extension-injected context (if `display: true`) |
| `"thinking_level_change"` | skip | Operational metadata; not user-visible |
| `"label"` | skip | User bookmark on an earlier entry |
| `"custom"` | skip | Extension state persistence; NOT part of LLM context |

### Layer 2 — `AgentMessage` roles (inside `type:"message"` entries)

The `message` field of every `"message"` entry is an `AgentMessage`:

```json
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"…","message":{"role":"user","content":"Hello","timestamp":1733227201000}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"…","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{…},"stopReason":"stop","timestamp":1733227202000}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"…","message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash","content":[{"type":"text","text":"output"}],"isError":false,"timestamp":1733227203000}}
```

`AgentMessage` roles and how they map to the normalized event contract:

| `role` | Normalized event(s) | Notes |
|--------|---------------------|-------|
| `"user"` | `user` | `content` is a plain string or `(TextContent \| ImageContent)[]` |
| `"assistant"` | `assistant` + `tool_use` + `thinking` | `content` blocks: `text` → `assistant`, `toolCall` → `tool_use`, `thinking` → `thinking` |
| `"toolResult"` | `tool_result` | Full tool output stored; `isError`, `toolCallId`, `toolName` |
| `"bashExecution"` | `tool_result` | Built-in bash execution; `command` + `output` + `exitCode`; maps to a synthetic `tool_result` with `tool_use_id: null` |
| `"custom"` | `system` | Extension-injected context; emit only when `display: true` |
| `"branchSummary"` | `system` | Summary of an abandoned branch; surfaced as a system notice |
| `"compactionSummary"` | `system` | Compacted-context summary; surfaced as a system notice |

#### Content block types

- **`TextContent`** — `{ type: "text", text: string }`
- **`ThinkingContent`** — `{ type: "thinking", thinking: string }` → `thinking` event
- **`ToolCall`** (inside assistant `content`) — `{ type: "toolCall", id, name, arguments }` → `tool_use` event
- **`ImageContent`** — `{ type: "image", data: string, mimeType: string }` → omit from display (binary)

### Tree traversal

Sessions are **trees**, not linear lists. Each entry's `parentId` points to its
parent; `parentId: null` marks the root. Branching (via `/tree` or `/fork`)
creates multiple children from the same parent.

The reader must:

1. Parse all lines into a `Map<id, entry>`.
2. Find the **current leaf** — the entry with no children whose `timestamp` is
   latest (for historical sessions the final active leaf is the most recently
   appended entry).
3. Walk from that leaf to the root via `parentId`, collecting entries in order.
4. **Reverse** the collected list to get chronological order.
5. Emit normalized events from that linear path only — branches not on this path
   are ignored.

For `"compaction"` entries on the path: the `summary` text represents all earlier
messages that were collapsed; surface it as a `system` event before the entries
that follow.

---

## Token usage

Pi stores full cost data in every `AssistantMessage.usage`:

```typescript
interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;      // USD
  };
}
```

The `cost.total` field is computed by Pi at request time. The reader can use it
directly for per-session and aggregate cost totals (rather than estimating via
`MODEL_PRICING`). Each `AssistantMessage` also carries `provider` (e.g.
`"anthropic"`) and `model` (e.g. `"claude-sonnet-4-5"`) fields for model
distribution stats.

---

## Timeline richness

Pi produces the second richest timeline after Claude Code:

**Present:**
- `user` — user turns
- `assistant` — assistant text responses
- `tool_use` — every tool call (including `mcp__*` calls if the MCP extension is
  active, registered with a `server_<name>` naming convention)
- `tool_result` — full tool output (`toolResult` + `bashExecution` roles)
- `thinking` — extended thinking blocks (when thinking is enabled)
- `system` — compaction summaries, branch summaries, model changes, extension
  context messages

**Absent (data-availability constraint, not a reader limitation):**
- `system_attachment` — Pi has no hook system analogous to Claude Code's hooks
- `local_command` — Pi has no slash-command protocol (skills are loaded via the
  system prompt, not as commands)

---

## Feature sourcing

| Feature | Source | Notes |
|---------|--------|-------|
| Projects | `~/.pi/agent/sessions/` directory listing | One dir per project; real path read from the first session file's `cwd` header field |
| Sessions | `<timestamp>_<uuid>.jsonl` files under each project dir | Sorted by filename (timestamp prefix) desc |
| Messages | Same JSONL, tree-traversed from active leaf to root | Flattened to normalized event contract; compaction/branch entries emitted as `system` |
| Stats | Derived from `AssistantMessage.usage` per session | Token totals, cache hit rate, cost, model distribution all available from JSONL |
| Logs | All session JSONL entries streamed as raw `{ project, session, lineNumber, raw }` | Same pattern as Claude Code |
| Agents | `~/.pi/agent/agents/*.md` | Individual agent definition files; same Markdown+frontmatter format as Claude Code agents |
| Skills | `~/.pi/agent/skills/*/SKILL.md` + `~/.agents/skills/*/SKILL.md` | Global pi-specific first; agentskills.io global standard second; deduped by slug |
| MCPs | `~/.pi/agent/mcp.json` + `~/.pi/agent/mcp-cache.json` | Present only when a community MCP extension is installed; `isAvailable` for `hasMcps` should check file existence |

---

## Availability check

`isAvailable()` returns `true` if `~/.pi/agent/sessions/` exists (Pi creates this
directory on first run). Checking for `~/.pi/agent/` alone is not sufficient since
that directory may exist without any sessions if the user only installed the CLI
without running it.

---

## Capabilities

| Capability | Supported | Reason |
|------------|-----------|--------|
| `hasHistory` | ✓ | JSONL session trees in `~/.pi/agent/sessions/` |
| `hasStats` | ✓ | Token usage and cost stored per `AssistantMessage` |
| `hasLogs` | ✓ | Raw JSONL streaming (same pattern as Claude Code) |
| `hasSkills` | ✓ | `~/.pi/agent/skills/` + `~/.agents/skills/` |
| `hasAgents` | ✓ | `~/.pi/agent/agents/*.md` — individual agent definition files (same Markdown+frontmatter convention as Claude Code) |
| `hasMcps` | ✓ | `mcp.json` when `pi-mcp-adapter` (or similar community extension) is installed; capability gated on file existence |
| `hasMemory` | ✗ | No dedicated memory system |
| `hasPlans` | ✗ | Pi has no native plan mode; community extensions (`pi-plan-mode`, `pi-plan`) store `.plan.md` files inside session dirs — not a dedicated plans folder |

---

## Caveats

- **Tree structure:** A session with branching may have multiple leaf candidates.
  The reader picks the leaf with the latest `timestamp`; other branches are
  silently dropped. This matches how Pi itself resumes sessions (most-recent leaf).
- **MCP is extension-provided:** Pi has no built-in MCP support. The dominant
  community extension is `pi-mcp-adapter` (99k downloads/month). Its config at
  `~/.pi/agent/mcp.json` uses a top-level `mcpServers` object keyed by server
  name with `command`/`args` for stdio and `url` for HTTP transports. An
  optional `directTools` array lists tools promoted to first-class Pi tools;
  `env` may contain environment variable mappings. The reader uses only
  `command`, `args`, and `url` for display and skips the rest.
- **Session format versions:** Current is v3. Versions 1 (linear) and 2 (tree
  without v3 role rename) are auto-migrated by Pi on load but the reader may
  encounter old files. Tolerate unknown entry `type` values and malformed lines
  (skip them) for forward/backward compatibility.
- **The JSONL format is unofficial** and can change between Pi releases; the reader
  should parse only the fields documented here and skip unknown fields.
- **Local-files-only** holds throughout — everything is read off disk, no network.
