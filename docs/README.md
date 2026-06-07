# Lens — documentation index

**Lens** is a local web app for browsing your AI coding-assistant session history
across multiple providers (Claude Code, GitHub Copilot for VS Code, …). It reads
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

When you add or change a provider, add/extend its folder here in the same spirit.

---

## How the app is built

Two npm workspaces under `src/`. The backend reads files and exposes a small HTTP
API; the frontend is a React SPA that renders the API responses and is fully
**provider-agnostic**.

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  src/web  (React + Vite)    │  HTTP  │  src/api  (Node, plain JS)   │
│  - 8 views, hash routing    │ ─────► │  - 12 endpoints              │
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
- **`utils.js`** — path constants (`CLAUDE_DIR`, `PROJECTS_DIR`, …), `CACHE_TTL`,
  `MODEL_PRICING`, `isTmp`, `parseFrontmatter`, and the `all`-provider id helpers
  (`packId`/`unpackId`).
- **`providers/<id>.js`** — declares a provider's `name`, `capabilities`,
  `isAvailable()` (+ optional `icon`), and imports its `readers/<id>/*.js` modules.
- **`readers/<topic>.js`** — a **registry hub** per topic (sessions, logs, stats,
  skills, agents, mcps, memory). Each provider's reader **self-registers** its
  implementation via `register('<id>', { … })`. The hub dispatches by provider id
  (and fans out for the `all` meta-provider).
- **`readers/<id>/*.js`** — the per-provider implementations that actually touch
  disk.

**API contract:** every endpoint returns HTTP 200 with
`{ data: …, error: null | string }`. Errors go in `error`, never thrown.

**Demo mode:** every endpoint accepts `?demo=true` and returns static data from
`demo-data.js`, so the app is fully explorable with nothing installed.

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

#### The 12 endpoints

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

### Frontend — `src/web` (React + Vite + Tailwind v4)

- Hash routing: `#/history/projectId/sessionId`.
- 8 views: `history | logs | skills | agents | mcps | memory | plans | settings`.
- **Provider-agnostic by rule:** the UI never compares provider names. Everything
  (names, icons, which nav items show) is driven by `/api/config` `capabilities`
  and by data shape. Adding a provider requires **zero** frontend changes.
- All fetches go through `apiUrl(path, demoMode)`, which appends `?provider=X`
  (from `localStorage`) and `?demo=true` when demo mode is on.

### Adding a provider (the whole checklist)

1. Create `src/api/providers/x.js` (`name`, `capabilities`, `isAvailable`, optional `icon`).
2. Create `src/api/readers/x/*.js` that `register('x', …)` for each topic you support.
3. Add the module to the `PROVIDERS` map in `index.js`.
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
