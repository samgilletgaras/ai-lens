# GitHub Copilot (VS Code) — how chat sessions are stored on disk

This note records what we learned while investigating why Copilot sessions in AI Lens
appeared to be **missing their first message(s)**. It documents the two on-disk
formats, what each one contains, where they disagree, and the reasoning behind how
the `ghcopilot-vscode` reader sources its data.

All findings below were verified against real session files on a Linux machine
(VS Code stable, Copilot Chat extension `0.48.1`–`0.50.0`, VS Code `1.119.0`–`1.122.0`).

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

One JSON object per line. Event types observed:

```
assistant.turn_start / assistant.turn_end
assistant.message        (text + reasoningText + toolRequests[])
tool.execution_start / tool.execution_complete   ({ success, toolCallId } only)
user.message             (data.content)
session.start            (copilotVersion, vscodeVersion, startTime, producer, …)
```

Clean and easy to parse. **But it is assistant-centric and lossy** (see below).

> **Newer copilot-agent format (extension ≥ 0.50, VS Code ≥ 1.122):** sessions
> produced with `producer: "copilot-agent"` (version 1) contain **only
> `session.start`** — no `user.message` or `assistant.message` events at all.
> The full conversation lives exclusively in `chatSessions` (see below).

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
  "timestamp": 1779713781178,          // epoch ms — when the user sent the message
  "agent": { "extensionId": { "value": "GitHub.copilot-chat" },
             "extensionVersion": "0.48.1", "id": "github.copilot.editsAgent" },
  "modelId": "...",
  "message": { "text": "/bmad-brainstorming lets brainstorm...", "parts": [...] },
  "response": [ /* stream of parts, see below */ ],   // may be empty until result patch arrives
  "result": { /* populated via kind:1 patch once the model finishes */ }
}
```

**Important:** in the newer copilot-agent format the request object written by the
`kind:2` append has `result: {}` (empty). The actual response data arrives in a
subsequent `kind:1` patch:

```jsonc
{ "kind": 1, "k": ["requests", 0, "result"], "v": {
    "metadata": {
      "toolCallRounds": [
        { "response": "OK",       // the assistant's text reply
          "toolCalls": [          // tool calls made in this round
            { "name": "run_in_terminal",
              "arguments": "{\"command\":\"npm test\",...}" }
          ],
          "timestamp": 1780836502922,
          "modelId": "gemini-3-flash-preview" }
      ]
    }
  }
}
```

Tool call format in `toolCallRounds[].toolCalls[]` is `{ name, arguments }` where
`arguments` is a JSON string (same shape as the transcript's `toolRequests[]`).

The legacy `response` array (stream of typed parts) is still written for older
sessions and may contain:

- **markdown** — `{ baseUri, value, supportHtml, supportThemeIcons }` (assistant text; *no* `kind` field)
- `thinking` — reasoning
- `toolInvocationSerialized` — a tool call
- `inlineReference` — a file/symbol reference

---

## The bug we were chasing: missing first message(s)

**Symptom:** Copilot sessions in AI Lens looked like the *assistant* spoke first; the
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

So for the slice AI Lens renders today (uniform tool calls), **the transcript is the
better tool source**, even though chatSession technically "has tool info."

---

## Session coverage gap (closed)

`chatSessions` contains **more sessions** than `transcripts`:

```
transcripts:  14 files
chatSessions: 20 files   →  6 sessions existed ONLY as chatSessions
```

This gap is now **closed**. After scanning the transcript folder, the reader
also scans `chatSessions/` within the same workspace hash and adds any session
IDs not already covered by a transcript. A sync read of the first 4 KB of each
candidate file checks `agent.extensionId.value === "GitHub.copilot-chat"` to
exclude non-Copilot sessions — `chatSessions` is VS Code core storage, so other
chat extensions could write there. Sessions where no `extensionId` is found in
the first 4 KB (empty or abandoned sessions with no requests) are also excluded.

For these **chatSessions-only** entries (stored with `filePath: null` in the
scan map), the reader uses the same chatSessions parsing path that already serves
the newer copilot-agent format: user messages from `kind:2` request objects and
assistant responses from `kind:1` result patches (`toolCallRounds`). Stats counts
messages and tool calls from those same fields; the logs view skips them (no
transcript to stream).

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

- **Discovery** → always from the **transcript** folder (Copilot is the only writer).
- **Assistant/tool turns (legacy format)** → from transcript `assistant.message`
  events (clean, uniform `toolRequests[]` args).
- **Assistant/tool turns (copilot-agent format)** → from chatSession `kind:1` result
  patches (`result.metadata.toolCallRounds[].response` + `.toolCalls[]`). These are
  applied when the transcript has no `assistant.message` events.
- **User turns** → from the chatSession (`requests[].message.text` + timestamp) in
  all cases — a superset that includes the opening prompt the transcript omits. Falls
  back to transcript `user.message` events only if no chatSession file exists.
- The two streams are **merged chronologically by timestamp** (user wins ties).
- Session list **preview + turn count** also come from the chatSession.

### `readChatRequests` — how kind:1 result patches are applied

`readChatRequests` collects three categories of lines in one pass:
1. `kind:0` base — seeds the `requests` array (often `requests: []` initially)
2. `kind:2` appends to `["requests"]` — each new request (with empty `result`)
3. `kind:1` patches where `k = ["requests", N, "result"]` — stored by index

After streaming, the patches are applied so every `requests[N].result.metadata.toolCallRounds`
is populated before the caller sees the data.

### Why a hybrid rather than "only chatSessions"

Each file is the **authoritative source for a different slice**:

- chatSession is authoritative for **user prompts** (transcript is lossy) and for
  **all data in the newer copilot-agent format**.
- transcript is authoritative for **tool calls in the legacy format** (uniform raw
  args with `explanation`/`goal` fields; chatSession's `toolSpecificData` is
  per-tool-type and drops rationale).

Going sole-chatSessions would *gain* the 6 missing sessions + exit codes, but would
*cost* a heavier parser and the loss of `vscodeVersion`. The hybrid picks the right
authority per slice and degrades gracefully across both format generations.

### A possible future full "flipped hybrid"

For maximum fidelity: **discover + spine exclusively from chatSessions** (catches
all sessions, complete prompts, exit codes/durations) and **enrich tool calls with
the transcript's raw arguments when a transcript exists**. Strictly more complete
than the current approach, but more code and more exposure to the chatSession
internal format. The current partial hybrid (transcript-first + chatSessions gap
fill) already closes the coverage gap with minimal additional complexity.

---

## Caveats

- Both formats are **undocumented and unofficial**; they can change between VS Code
  / extension versions. The reader deliberately parses only narrow slices to limit
  the blast radius.
- Figures (file counts, request counts) are from one machine's data and illustrate
  the *patterns*, not fixed quantities.
- **No remote / local-files-only** still holds — both files are read off disk.
