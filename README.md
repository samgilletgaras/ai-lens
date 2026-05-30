# Claude Lens

A local web app for browsing your [Claude Code](https://claude.ai/code) session history. It reads the JSONL files Claude Code writes to `~/.claude/projects/` and renders them as a navigable timeline of messages, tool calls, thinking blocks, and system events.

> **Personal tool, no guarantees.** Claude Lens reads your raw session files directly off disk. It is read-only and makes no network requests beyond serving your own browser. That said, your session files may contain sensitive information (API keys pasted into prompts, file contents, etc.) — keep the dev server local and do not expose it to a network.

---

## What you can do with it

| View | What it shows |
|---|---|
| **History** | Every Claude Code project, with a paginated list of sessions and a full message timeline per session |
| **Logs** | Raw JSONL entries across all projects, paginated, for debugging |
| **Skills** | All skills installed under `~/.claude/skills/`, with descriptions extracted from `SKILL.md` |
| **MCPs** | MCP servers configured in `~/.claude/`, with per-server tool-call history |
| **Memory** | `CLAUDE.md` and memory markdown files under `~/.claude/` |
| **Plans** | Plan markdown files from `~/.claude/plans/`, sorted by last-modified, full-text searchable |
| **Project diagnostics** | Token totals, cost estimate, top tools used, and a 26-week activity heatmap — shown when you select a project but no session |

---

## Platform support

| Platform | Status |
|---|---|
| **Arch Linux** | Supported and tested |
| **Other Linux / macOS** | Should work — not tested |
| **Windows** | Untested, likely needs path adjustments |

---

## Prerequisites

- **Node.js 18 or later** — the backend uses `readline` async iterators and ES module syntax
- **Claude Code** installed and having been used at least once, so `~/.claude/projects/` exists with JSONL session files

---

## Setup

```bash
git clone <repo-url> claude-lens
cd claude-lens
npm install
```

`npm install` installs both workspaces (`src/cli` and `src/web`) from the root.

---

## Running

```bash
npm run dev
```

This starts both servers concurrently:

| Server | URL | What it does |
|---|---|---|
| Backend (Node.js) | http://localhost:3000 | REST API that reads `~/.claude/` |
| Frontend (Vite) | http://localhost:5173 | React app — **open this in your browser** |

The frontend proxies all `/api/*` requests to the backend, so you only need to visit port 5173.

**Run them individually if needed:**

```bash
npm run dev:cli   # backend only
npm run dev:web   # frontend only
```

---

## Warnings

- **Local use only.** The backend has no authentication. Anyone who can reach port 3000 or 5173 on your machine can read your entire Claude Code session history, memory files, and plans. Do not run this on a shared machine or expose either port through a firewall/tunnel.
- **No data is written or sent.** Claude Lens is strictly read-only. It does not modify your `.claude/` directory, send telemetry, or make outbound requests.
- **Session files can be large.** Projects with many long sessions will take a moment to parse on first load. Results are cached in memory for 60 seconds.
- **Directory names containing `tmp` are skipped.** Any project folder with `tmp` anywhere in its name is excluded from all scans.
- **No tests.** `npm test` exits with an error — there is no test suite yet.

---

## Project structure

```
claude-lens/
├── src/
│   ├── cli/          # Node.js backend — plain JS, no framework, single file
│   │   └── index.js
│   └── web/          # React + Vite + Tailwind v4 frontend
│       └── src/
│           ├── App.tsx
│           ├── components/
│           │   ├── MessageBubble.tsx      # Timeline renderer for one message
│           │   ├── LogsViewer.tsx         # Raw JSONL log browser
│           │   ├── SkillsViewer.tsx       # Skills card grid
│           │   ├── MCPsViewer.tsx         # MCP servers + tool-call history
│           │   ├── MemoryViewer.tsx       # CLAUDE.md / memory file viewer
│           │   ├── PlansViewer.tsx        # Plans markdown browser
│           │   ├── ProjectDiagnostics.tsx # Per-project stats + heatmap
│           │   └── ActivityHeatmap.tsx    # 26-week contribution heatmap
│           ├── types.ts                   # All TypeScript interfaces
│           └── utils.ts                   # Formatting helpers
├── package.json      # Root workspace — also has the `dev` script
└── CLAUDE.md         # Instructions for Claude Code sessions in this repo
```

---

## API

The backend exposes ten endpoints, all returning `{ data: ..., error: null | string }`:

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/projects` | All projects with session count and last-updated timestamp |
| `GET /api/history?project=&page=&pageSize=` | Paginated sessions for a project |
| `GET /api/messages?project=&session=` | All messages for one session |
| `GET /api/logs?page=&pageSize=` | Raw JSONL entries with project/session metadata |
| `GET /api/skills[?slug=]` | Skills from `~/.claude/skills/` |
| `GET /api/mcps[?server=]` | MCP server list or single-server detail |
| `GET /api/memory[?project=&file=]` | Memory and `CLAUDE.md` files |
| `GET /api/stats[?project=]` | Aggregate or per-project token/tool/activity stats |
| `GET /api/plans[?file=]` | Plan markdown files from `~/.claude/plans/` |

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js (plain JS, `http` / `fs` / `readline` only, no framework) |
| Frontend | React 19 + TypeScript |
| Bundler | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`), zero vanilla CSS outside `index.css` |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm + @tailwindcss/typography |
