# AI Lens — documentation index

**AI Lens** is a local web app for browsing your AI coding-assistant session history
across multiple providers (Claude Code, GitHub Copilot for VS Code, Cursor, …). It reads
each provider's session/config files **directly off disk** and renders them as a
timeline of messages, tool calls, and system events — plus skills, agents, MCP
servers, memory, plans, and usage stats.

> **Core principle: local files only, no remote, ever.** Every reader works
> entirely from files on disk derived from `os.homedir()` / `os.platform()`. No
> network calls, no telemetry, no auth services. It must work out-of-the-box for
> any user who has the tool installed (Linux + macOS; Windows is out of scope).

---

## Per-provider documentation

Each provider has its own folder with a global reference (`README.md`), which may
link to deeper detail pages.

| Provider | Global reference |
|----------|------------------|
| Claude Code | [`claude/`](claude/README.md) — `~/.claude/` layout, the session JSONL envelope, and where projects, messages, logs, stats, skills, agents, MCPs, memory, and plans come from. |
| GitHub Copilot (VS Code) | [`ghcopilot-vscode/`](ghcopilot-vscode/README.md) — VS Code storage layout, workspace/session discovery, and where each feature's data comes from. |
| GitHub Copilot (CLI) | [`ghcopilot-cli/`](ghcopilot-cli/README.md) — `~/.copilot/` layout, the CLI JSONL event log format (including `tool_result` events absent from VS Code), workspace.yaml project discovery, agents, skills, MCP config, and global instructions. |
| Cursor | [`cursor/`](cursor/README.md) — `~/.cursor/` layout, agent-transcript JSONL format, project slug decoding, plans, skills, and MCP metadata. |
| Pi | [`pi/`](pi/README.md) — `~/.pi/agent/` layout, the session JSONL tree format, tree traversal, per-message token costs, skills, and optional MCP config. Implemented in `src/api/providers/pi.js` + `src/api/readers/pi/`. |

When you add or change a provider, add/extend its folder here in the same spirit.

---

## How the app is built

Two npm workspaces under `src/`. The backend reads files and exposes a small HTTP
API; the frontend is a React SPA that renders the API responses and is fully
**provider-agnostic**.

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  src/web  (React + Vite)    │  HTTP  │  src/api  (Node, plain JS)   │
│  - 8 views, hash routing    │ ─────► │  - 13 endpoints              │
│  - provider-agnostic UI     │ /api/* │  - PROVIDERS registry        │
│  - reads /api/config only   │ ◄───── │  - readers self-register     │
└─────────────────────────────┘        └──────────────┬───────────────┘
                                                       │ fs / readline
                                                       ▼
                                          ~/.claude/…, VS Code storage, …
```

### Backend — `src/api` (plain JavaScript, no framework, no build step)

Node core only (`http`, `fs`, `readline`, `os`, `path`).

- **`index.js`** — HTTP server + route handlers; holds the `PROVIDERS` registry
  (`{ id: providerModule }`). `/api/config` builds the provider list and
  **prepends a synthesized `all` ("All Providers") meta-provider**.
- **`config.js`** — exports the `config` object (currently `{ version }`), read once
  at startup from `package.json`. Wrapped in a `try/catch` so a missing or malformed
  `package.json` falls back to `version: 'unknown'` without crashing.
- **`utils.js`** — path constants (`CLAUDE_DIR`, `PROJECTS_DIR`, …), `CACHE_TTL`,
  `LOGS_CAP` (upper bound for log fan-out), `MODEL_PRICING`, `isTmp`,
  `parseFrontmatter`, `tildeHome` (collapses `os.homedir()` to `~` for display
  paths), `dedupeBySourcePath` (merges list items sharing a `sourcePath`), and the
  `all`-provider id helpers (`packId`/`unpackId`).
- **`providers/<id>.js`** — declares a provider's `name`, `capabilities`,
  `isAvailable()` (+ optional `icon`), and imports its `readers/<id>/*.js` modules.
- **`readers/<topic>.js`** — a **registry hub** per topic (sessions, logs, stats,
  skills, agents, mcps, memory, plans). Each provider's reader **self-registers** its
  implementation via `register('<id>', { … })`. The hub dispatches by provider id
  (and fans out for the `all` meta-provider).
- **`readers/<id>/*.js`** — the per-provider implementations that actually touch
  disk.

**API contract:** every endpoint returns HTTP 200 with
`{ data: …, error: null | string }`. Errors go in `error`, never thrown.

**Demo mode:** most data endpoints accept `?demo=true` and return static data from
`demo-data.js`, so the app is fully explorable with nothing installed.
(`/api/health` and `/api/config` always return live data regardless.)

**Provider dispatch:** data endpoints accept `?provider=<id>`; omitting it uses the
first registered provider. `?provider=all` aggregates across every provider
(project/memory ids are namespaced `<provider>:::<id>` so drill-downs route back).
Under `all`, results also carry their **source `provider` id** so the frontend can
badge provenance without name-checking: projects, skills, agents, MCPs, memory
entries, plans, and the diagnostics `topProjects` rows each get a `provider` field,
and `/api/stats` adds `estimatedCostByProvider` (`{ <id>: usd }`) alongside the
summed `estimatedCostUsd`. The frontend resolves that id to a display name/badge
via `/api/config`. Sessions also carry a `provider` id, but the UI doesn't badge
each session row — you always reach sessions *through* a project, which is already
namespaced per provider — so it's used only to resolve the assistant's display
label in the message view. For **detail** fetches under `all`, the UI passes a
`from=<provider>` hint (derived from the list item's `provider`) so the hub routes
deterministically instead of guessing by a colliding slug/id; memory routes via its
already-namespaced `project` id instead.

**Source file paths:** every entity type exposes its on-disk path(s), collapsed to
`~` via `tildeHome()`, so the UI can disclose where data lives. Sessions carry
`sourcePaths: string[]` (multiple files for Copilot: transcript + chatSessions).
Skills, agents, memory entries, and plans carry `sourcePath: string`. MCPs use the
existing `source: string` field (Copilot already had it; Claude plugin MCPs now
populate it too; cloud MCPs have no file). The frontend gates all disclosures on the
`showSourcePaths` user preference (`localStorage` key `lens-show-source-paths`,
default off), toggled in Settings.

#### The 13 endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/health` | liveness `{ ok: true }` |
| `GET /api/config` | `{ version, providers[], defaultProvider }` — single source of truth for provider list/names/icons/capabilities/availability |
| `GET /api/projects` | project list with session counts + last-updated |
| `GET /api/history?project=&page=&pageSize=` | paginated sessions for a project |
| `GET /api/messages?project=&session=` | all messages for one session |
| `GET /api/logs?page=&pageSize=` | raw JSONL entries as `{ project, session, lineNumber, raw }` |
| `GET /api/skills[?slug=]` | skills list / detail |
| `GET /api/agents[?slug=]` | agents list / detail |
| `GET /api/mcps[?server=]` | MCP servers list / detail with tool-call history |
| `GET /api/memory[?project=&file=]` | memory files |
| `GET /api/stats[?project=]` | aggregate or per-project token/tool/activity stats |
| `GET /api/plans[?file=]` | plan markdown files (provider-agnostic) |
| `POST /api/settings` | persists user settings (JSON body `{ patch: { key: value } }`); whitelisted keys only |

### Normalized message contract

`/api/messages` returns a **flat array of typed event objects** — no bundled block arrays. Every provider's `getMessages()` must flatten its on-disk format into this shape before returning:

| `role` | Extra fields | Who emits |
|--------|-------------|-----------|
| `user` | `content: string` | all |
| `assistant` | `content: string` | all |
| `tool_use` | `name, input, id?` | all |
| `tool_result` | `content, is_error?, tool_use_id?` | Claude + demo |
| `thinking` | `content: string` | Claude |
| `system` | `content: string` | Claude, Cursor (`<system_reminder>`) |
| `system_attachment` | `content: AttachmentContent` | Claude |
| `local_command` | `name, caveat?` | Claude slash commands |

All parsing logic (block flattening, XML tag extraction, vendor-specific envelope unwrapping) lives in the backend reader. The frontend `MessageBubble` component maps `role` to display style only — it never inspects content structure.

**Timeline richness varies by provider** — this is a data-availability constraint, not a code issue. Claude Code logs tool results, thinking blocks, hook events, and system notices; Cursor and GitHub Copilot transcripts only store the conversation turns and tool calls. See each provider's doc for details.

### Frontend — `src/web` (React + Vite + Tailwind v4)

- Hash routing: `#/history/projectId/sessionId`.
- 8 views: `history | logs | skills | agents | mcps | memory | plans | settings`.
- **Provider-agnostic by rule:** the UI never compares provider names. Everything
  (names, icons, which nav items show) is driven by `/api/config` `capabilities`
  and by data shape. Adding a provider requires **zero** frontend changes.
- All fetches go through `apiUrl(path, demoMode)`, which appends `?provider=X`
  (from `localStorage`) and `?demo=true` when demo mode is on.
- `MessageBubble` is a pure `role → renderer` switch: each `role` value maps to a
  fixed icon, dot color, and text color. No block-type routing, no provider checks.

### Adding a provider (the whole checklist)

1. Create `src/api/providers/x.js` (`name`, `capabilities`, `isAvailable`, optional `icon`).
2. Create `src/api/readers/x/*.js` that `register('x', …)` for each topic you support.
3. Add the module to the `PROVIDERS` map in `index.js` **and** `import` the provider file so its readers self-register.
4. (Optional) Add a badge color token in `index.css`.
5. Write a `docs/x/…` note describing where its data lives on disk.

That's it — name, icon, capabilities, and availability flow through `/api/config`.

---

## Data-sourcing rules (all providers)

- **Local files only — no remote.** Read files off disk; never call an API/network/auth.
- **Generic — nothing machine/user/project-specific.** Derive paths from
  `os.homedir()` / `os.platform()` (and `XDG_CONFIG_HOME` where applicable). Never
  hardcode a username, absolute path, workspace hash, or UUID.
- **Provider isolation.** Each provider's reader only touches its own ecosystem's
  files. (Cursor ≠ GitHub Copilot — a different editor gets its own provider.)
- **Skip `tmp`.** Directories named exactly `tmp` or ending in `-tmp` are ignored in all scans (`isTmp`).
- **Cross-platform: Linux + macOS only.** Windows is out of scope.
