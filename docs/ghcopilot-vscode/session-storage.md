# GitHub Copilot (VS Code) — how chat sessions are stored on disk

This note records what we learned while investigating why Copilot sessions in Lens
appeared to be **missing their first message(s)**. It documents the two on-disk
formats, what each one contains, where they disagree, and the reasoning behind how
the `ghcopilot-vscode` reader sources its data.

All findings below were verified against real session files on a Linux machine
(VS Code stable, Copilot Chat extension `0.48.1`, VS Code `1.119.0`).

---

## TL;DR

VS Code persists each chat session in **two separate files, written by two
different components, in two different formats, for two different purposes**:

| File | Written by | Format | Role |
|------|-----------|--------|------|
| `chatSessions/<id>.jsonl` | **VS Code core** (chat framework) | append-only "observable diff" log | **source of truth** — what the panel renders & restores |
| `GitHub.copilot-chat/transcripts/<id>.jsonl` | **Copilot extension** | flat event stream | derived, *lossy* convenience transcript |

The transcript is cleaner to parse but **drops the opening user prompt** (and some
other turns). The chatSession is complete but its format is gnarlier.

**Neither file is a superset of the other** — each holds information the other lacks.

---

## The two files

Both live under a per-workspace storage hash:

```
<vscode-user>/User/workspaceStorage/<hash>/
├── GitHub.copilot-chat/
│   └── transcripts/<sessionId>.jsonl      ← Copilot extension transcript
└── chatSessions/<sessionId>.jsonl          ← VS Code core chat store
```

The two files for one conversation share the **same session UUID**.

### 1. `transcripts/<id>.jsonl` — Copilot extension (flat event stream)

One JSON object per line. Event types observed (with counts across 14 sessions):

```
assistant.turn_start / assistant.turn_end
assistant.message        (text + reasoningText + toolRequests[])
tool.execution_start / tool.execution_complete   ({ success, toolCallId } only)
user.message             (data.content)
session.start            (copilotVersion, vscodeVersion, startTime, …)
```

Clean and easy to parse. **But it is assistant-centric and lossy** (see below).

### 2. `chatSessions/<id>.jsonl` — VS Code core (observable-diff log)

This is VS Code's internal serialization of an observable object, replayed as an
append-only patch log. Line shapes:

- `kind: 0` — base **snapshot** (`{ requests, sessionId, creationDate, … }`)
- `kind: 1` — **set a path**: `{ kind:1, k:[path…], v:<value> }`
- `kind: 2` — **append to an array**: `{ kind:2, k:[path…], v:[items…] }`

To reconstruct state you start from the `kind:0` base and apply patches in order.
For our purposes we only need the `requests` array, which is seeded in the base
and grown via `kind:2` appends to `["requests"]`. Each request looks like:

```jsonc
{
  "requestId": "...",
  "timestamp": 1779713781178,          // epoch ms
  "agent": { "extensionId": { "value": "GitHub.copilot-chat" },
             "extensionVersion": "0.48.1", "id": "github.copilot.editsAgent" },
  "modelId": "...",
  "message": { "text": "/bmad-brainstorming lets brainstorm...", "parts": [...] },
  "response": [ /* stream of parts, see below */ ]
}
```

The `response` array is a stream of typed parts:

- **markdown** — `{ baseUri, value, supportHtml, supportThemeIcons }` (the assistant's text; *no* `kind` field)
- `thinking` — reasoning
- `toolInvocationSerialized` — a tool call (see tool section)
- `inlineReference` — a file/symbol reference

---

## The bug we were chasing: missing first message(s)

**Symptom:** Copilot sessions in Lens looked like the *assistant* spoke first; the
user's opening prompt was gone.

**Root cause:** the **transcript never records the opening user prompt.** Every
transcript begins `session.start → assistant.message`, and the first turn's prompt
is simply absent. The Copilot extension's transcript writer is assistant-centric —
it starts logging when *it* begins handling a turn, so the initial request that
creates the session (handled by VS Code core first) never lands in the transcript.

Verified across all 14 sessions: the first `assistant.message` timestamp always
precedes the first `user.message` by minutes. One session had **zero**
`user.message` events in its transcript at all.

It's not only the *first* turn — the transcript also drops the occasional
slash-command-only turn and "Try Again" retry. Example: one session had 63
`user.message` events in the transcript but 65 requests in the chatSession.

**The complete, ordered list of user prompts lives in `chatSessions`**
(`requests[].message.text` + `requests[].timestamp`), which is a superset.

---

## Field-by-field comparison

| Data | Transcript | chatSession | Notes |
|------|-----------|-------------|-------|
| **User prompts** | ❌ lossy (drops opening + some turns) | ✅ complete | the original bug |
| **Assistant text** | ✅ `assistant.message.content` | ✅ markdown `value` parts | both fine |
| **Tool call — which tool** | ✅ `toolRequests[].name` | ✅ `toolInvocationSerialized.toolId` | both fine |
| **Tool call — input** | ✅ **raw model args** as uniform JSON: `{command, explanation, goal, mode}` | ⚠️ `toolSpecificData` — UI-shaped, **different per tool type** | see below |
| **Tool call — model rationale** | ✅ `explanation` / `goal` / `mode` | ❌ stripped | transcript-only |
| **Tool result / output** | ❌ none (`{success}` only, `hasResult:false`) | ⚠️ partial — `exitCode`, `duration` for terminal | neither stores full output |
| **Thinking / reasoning** | ✅ `reasoningText` | ✅ `thinking` parts | neither rendered today |
| **Inline file references** | ❌ | ✅ `inlineReference` | chatSession-only |
| **copilotVersion** | ✅ `session.start` | ✅ `agent.extensionVersion` | both |
| **vscodeVersion** | ✅ `session.start` | ❌ not present | transcript-only |
| **Per-event ISO timestamps** | ✅ every event | ⚠️ per-request only (+ some part-level) | transcript finer |

### Tools: the key asymmetry

- **Transcript** gives the **raw model arguments** as a uniform JSON object —
  `{"command":"…","explanation":"…","goal":"…","mode":"sync"}` — identical shape
  for every tool. Maps 1:1 onto a `tool_use { name, input }` block.
- **chatSession** gives `toolSpecificData`, a **per-tool-type UI-rendering form**.
  For a terminal call it's `{ kind:"terminal", commandLine:{original,…}, cwd,
  terminalCommandState:{ exitCode, duration }, … }`. Reads, edits, etc. each have
  a different shape. It *adds* execution results (exit code, duration) but *drops*
  the model's rationale args.

So for the slice Lens renders today (uniform tool calls), **the transcript is the
better tool source**, even though chatSession technically "has tool info."

---

## Session coverage gap (a separate finding)

`chatSessions` also contains **more sessions** than `transcripts`:

```
transcripts:  14 files
chatSessions: 20 files   →  6 sessions exist ONLY as chatSessions
```

Because the reader currently **discovers sessions by scanning the transcripts
folder**, those 6 Copilot conversations are **invisible in Lens**. This is a
latent data-completeness gap independent of the first-message bug. Not yet
addressed — flagged here for a future decision.

---

## Non-Copilot sessions in `chatSessions`

In the data we inspected, **every** chatSession request was
`agent.extensionId == "GitHub.copilot-chat"` (183/183). But `chatSessions` is VS
Code *core* storage, not Copilot-specific — another user with a different chat
participant/agent extension could have non-Copilot sessions in the same folder.

**Implication:** if discovery is ever switched to scan `chatSessions` directly,
it must filter by `agent.extensionId === "GitHub.copilot-chat"` (with an edge case
for empty/abandoned sessions that have no requests to inspect). Today this is a
non-issue only because we discover via transcripts (which only Copilot writes) and
open the matching chatSession by id.

---

## What the reader does today (the hybrid)

`src/api/readers/ghcopilot-vscode/ghcopilot-vscode-sessions.js`:

- **Discovery + assistant/tool turns** → from the **transcript** (clean, uniform
  tool inputs, easy to parse).
- **User turns** → from the **chatSession** (`requests[].message.text` + timestamp),
  a superset that includes the opening prompt. Falls back to transcript
  `user.message` events if no chatSession file exists.
- The two streams are **merged chronologically by timestamp** (user wins ties, so a
  prompt precedes its assistant turn). Verified chronological on all sessions.
- Session list **preview + turn count** also come from the chatSession so the list
  shows the real first prompt.

### Why a hybrid rather than "only chatSessions"

Each file is the **authoritative source for a different slice**:

- chatSession is authoritative for **user prompts** (transcript is lossy).
- transcript is authoritative for **tool calls** (uniform raw args; chatSession's
  form is per-tool and drops rationale).

Going sole-chatSessions would *gain* the 6 missing sessions + exit codes, but would
*cost*: a heavier/brittler parser (observable-diff + per-tool `toolSpecificData`
adapters), the loss of model tool-rationale and `vscodeVersion`, and a need for
`extensionId` filtering. Neither file dominates, so the hybrid picks the right
authority per slice.

### A possible future "flipped hybrid" (not implemented)

For maximum fidelity: **discover + spine from chatSessions** (catches all 20
sessions, complete prompts, exit codes/durations) and **enrich tool calls with the
transcript's raw arguments when a transcript exists**. Strictly more complete than
today, but more code and more exposure to the chatSession internal format.

---

## Caveats

- Both formats are **undocumented and unofficial**; they can change between VS Code
  / extension versions. The reader deliberately parses only narrow slices to limit
  the blast radius.
- Figures (file counts, request counts) are from one machine's data and illustrate
  the *patterns*, not fixed quantities.
- **No remote / local-files-only** still holds — both files are read off disk.
