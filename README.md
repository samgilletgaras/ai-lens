# Claude Lens

A local web app to browse your [Claude Code](https://claude.ai/code) session history.

> **Heads up:** This started as a quick vibe-coded tool — I just wanted to see my JSONL Claude Code session history in a readable way so I could understand exactly what was happening behind the scenes when using my agents and skills and find ways to optimise them. It grew way beyond that. A proper refactor is on my todo list... In the meantime, it can maybe help you too !

It started by reading the JSONL session files from `~/.claude/projects/` and showing them as a timeline. It now also surfaces skills, MCPs, memory files, plans, and per-project stats. Fully local and read-only — nothing is sent anywhere.

---

## What's inside

- **History** — browse all your projects and sessions, with a full message timeline
- **Logs** — raw JSONL entries across all projects, for debugging
- **Skills** — skills installed under `~/.claude/skills/`
- **MCPs** — MCP servers from `~/.claude/` with per-server tool-call history
- **Memory** — `CLAUDE.md` and memory files
- **Plans** — plan markdown files from `~/.claude/plans/`
- **Project diagnostics** — token totals, cost estimate, top tools, and a 26-week activity heatmap

---

## Requirements

- Node.js 18+
- Claude Code installed and used at least once (so `~/.claude/projects/` exists)

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
- **Read-only.** Nothing in `~/.claude/` is ever modified.
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

Built and tested on Arch Linux ([Omarchy](https://omarchy.org)). Should work fine on other Linux distros and macOS. Windows probably not, maybe in WSL with some path tweaks ?