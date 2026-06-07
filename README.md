# AI Lens

A local web app to browse your AI coding-assistant session history — [Claude Code](https://claude.ai/code) and [GitHub Copilot](https://github.com/features/copilot) (in VS Code), side by side (More to come).

> **Heads up:** This started as a quick vibe-coded tool — I just wanted to see my JSONL Claude Code session history in a readable way so I could understand exactly what was happening behind the scenes when using my agents and skills and find ways to optimise them. It grew way beyond that. A proper refactor is on my todo list... In the meantime, it can maybe help you too !

It started by reading the JSONL session files from `~/.claude/projects/` and showing them as a timeline. It now spans multiple providers and surfaces skills, agents, MCPs, memory files, plans, and per-project stats — with an **All Providers** view (the default) that merges everything detected on your machine. Fully local and read-only — nothing is sent anywhere.

> **Work in progress:** GitHub Copilot (VS Code) and Cursor provider support is still being developed — some session history, stats, or metadata may be incomplete or missing.

---

## What's inside

- **History** — browse all your projects and sessions, with a full message timeline
- **Skills** — installed skills and custom agents
- **MCPs** — MCP servers with per-server tool-call history
- **Memory** — memory and config files (rules, instructions, workspace context)
- **Plans** — plan files
- **Project diagnostics** — token totals, cost estimate, top tools, and a 26-week activity heatmap

Each view shows only what the active provider supports, and a small icon + badge in the sidebar marks which provider you're looking at.

---

## Providers

Switch providers in **Settings**, or stay on **All Providers** (the default) to see everything at once:

- **Claude Code** — reads `~/.claude/`
- **GitHub Copilot (VS Code)** *(work in progress)* — reads VS Code's workspace & global storage (stable + Insiders)
- **Cursor** *(work in progress)* — reads `~/.cursor/` agent transcripts, plans, skills, and MCPs

---

## Requirements

- Node.js 18+
- At least one supported provider installed on your machine

> No data? The app falls back to a built-in **Demo mode** with realistic sample data so you can try it out.

---

## Setup & running

```bash
bash start.sh
```

Then open http://localhost:5173 in your browser.

```bash
npm run dev:api   # backend only
npm run dev:web   # frontend only
```

---

## A few things to know

- **Local only.** No auth on the backend. Don't expose either port to a network.
- **Read-only.** Nothing on disk is ever modified.
- **No tests yet.** `npm test` will error out.
- Folders with `tmp` in the name are skipped in all scans.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js (plain JS, `http` / `fs` / `readline` only, no framework) |
| Frontend | React 19 + TypeScript |
| Bundler | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`), zero vanilla CSS outside `index.css` |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm + @tailwindcss/typography |

---

## Platform

Built and tested on Arch Linux (Omarchy). Should work fine on other Linux distros and macOS. Windows probably not, maybe in WSL with some path tweaks ?