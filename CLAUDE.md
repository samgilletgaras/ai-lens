# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

AI Lens is a local web app to browse AI coding-assistant session history across
multiple providers (Claude Code, GitHub Copilot, …). It reads each provider's
session/config files **directly off disk** and renders them as a timeline of
messages, tool calls, and system events — plus skills, agents, MCPs, memory,
plans, and usage stats.

**The architecture lives in [`docs/`](docs/README.md), which is the source of
truth — read it before changing code.** Don't duplicate that detail here:

- [`docs/README.md`](docs/README.md) — full architecture: backend/frontend split,
  the registry-hub + self-registration pattern, the `all` meta-provider, all 12
  endpoints, the normalized message contract, demo mode, provider dispatch, the
  add-a-provider checklist, and the data-sourcing rules.
- [`docs/claude/README.md`](docs/claude/README.md) — Claude Code's `~/.claude/`
  layout, the session JSONL envelope, and where each feature's data comes from.
- [`docs/cursor/README.md`](docs/cursor/README.md) — Cursor's `~/.cursor/` layout,
  agent-transcript JSONL format, the XML wrapper stripping, and timeline richness
  limitations.
- [`docs/ghcopilot-vscode/`](docs/ghcopilot-vscode/README.md) — VS Code storage
  layout, the `transcripts` ⇄ `chatSessions` merge (why the opening prompt is
  recovered from `chatSessions`), and timeline richness limitations.

## Commands

All commands run from the repo root unless noted.

```bash
npm run dev        # backend + frontend concurrently
npm run dev:api    # Node.js backend on port 3000
npm run dev:web    # Vite dev server on port 5173

# Web only (from src/web/)
npm run build      # TypeScript compile + Vite build
npm run lint       # ESLint
npm run preview    # Preview production build
```

No tests are configured yet (`npm test` exits with error).

## Non-negotiable constraints

These govern every change. The full rationale is in `docs/README.md`.

- **Backend is plain JavaScript** (`src/api/`) — no TypeScript, no framework, no
  build step. Node core only (`http`, `fs`, `readline`, `os`, `path`). Split
  across `index.js`, `utils.js`, `config.js`, `providers/`, and `readers/`.
- **Zero vanilla CSS** outside `src/web/src/index.css` — no BEM, no co-located
  `.css` files. All styling is inline Tailwind utility classes.
- **Frontend is fully provider-agnostic.** `/api/config` is the single source of
  truth for provider names, icons, capabilities, and availability. No rendering
  path may compare provider names (`provider === 'ghcopilot'`, etc.); gate on
  `capabilities.*` flags or data shape. Adding a provider must require **zero**
  frontend rendering changes. (Permitted exceptions: `apiUrl`/`slugify`, the
  `PROVIDER_MIGRATIONS` map, `index.css` badge tokens, and `SettingsViewer`.)
- **`getMessages()` must emit the normalized flat event contract.** Every provider's
  reader must flatten its on-disk format into typed role events (`user`, `assistant`,
  `tool_use`, `tool_result`, `thinking`, `system`, `system_attachment`,
  `local_command`) before returning. No `Block[]` arrays, no bundled multi-block
  messages, no provider-specific XML tags. All parsing lives in the reader.
  `MessageBubble` maps `role → display style` only. See `docs/README.md` for the
  full contract table.
- **Backend provider isolation.** Each `readers/<id>/` directory touches only its
  own ecosystem's files. Cursor ≠ GitHub Copilot — a new editor gets a new provider.
- **Local files only, no remote, ever.** Read off disk; never call an API,
  network endpoint, or auth service. Derive paths from `os.homedir()` /
  `os.platform()` (and `XDG_CONFIG_HOME` where applicable) — never hardcode a
  username, absolute path, workspace hash, or UUID. Linux + macOS only; Windows
  is out of scope for now.

## Styling tokens

Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`). Custom design
tokens live in `src/web/src/index.css` under `@theme` — always use the `lens-*`
tokens, never raw equivalents.

Markdown content uses `@tailwindcss/typography` (`prose prose-invert`).

## Versioning

To bump the version, update the `version` field in all 3 files: `package.json`,
`src/api/package.json`, `src/web/package.json`.

## Keeping docs current

Documentation is part of the change, not an afterthought. **In the same turn that
you add or change an endpoint, component, view, reader, provider, constraint, or
data-on-disk layout, update the affected docs:**

- `docs/` — the architectural source of truth. Update `docs/README.md` for
  cross-cutting changes (endpoints, the provider model, data-sourcing rules) and
  the relevant `docs/<provider>/` note for provider-specific on-disk details.
- This `CLAUDE.md` — update the constraints, commands, styling tokens, or doc
  pointers above whenever they drift.

Stale docs cause incorrect code generation. If a change makes any statement in
`docs/` or `CLAUDE.md` wrong, fixing it is part of finishing the change.

## Provider docs are working notes, not specifications

The per-provider docs in `docs/<provider>/` are built up incrementally as
features are discovered — they are **not authoritative specifications**. When
implementing a provider feature or debugging unexpected behaviour, **always
verify against the provider's official documentation or source** (GitHub repo,
npm registry, official website) rather than trusting the local docs blindly.
Use web search proactively when something in the local docs seems incomplete,
contradicts observed behaviour, or has not been verified against a real
installation.
