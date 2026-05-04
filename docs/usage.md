# Usage

## Core Workflow

### 1. Start a tracked session

```bash
cd your-project
trc claude
```

This creates a Trace session, starts tracking file changes and git activity, then launches Claude. Use Claude exactly as you normally would.

With repository context injected:

```bash
trc claude --context             # recent repo memory
trc claude --context=replay      # replay-based memory
trc claude --context=auth        # only auth-related memory
```

### 2. Work normally

Trace runs in the background. It tracks:
- File creates, edits, deletes (via filesystem watcher)
- Git diffs with full patch content
- Commits (hash, message, author, branch)
- Branch switches

Prompts are auto-captured in real-time from Claude's session files (polled every 12 seconds).

### 3. End the session

Exit Claude normally (Ctrl+C or `/exit`). Trace automatically:
- Performs a final prompt sweep
- Correlates each prompt with the files, commits, and diffs it caused
- Ends the session and prints a summary

### 4. Review and replay

```bash
trc sessions                     # see all sessions
trc timeline <session-id>        # what happened, chronologically
trc replay <session-id>          # engineering story with chapters
trc prompts <session-id>         # all prompts and their correlations
trc why <file>                   # which prompt caused this file change
trc context                      # current repo engineering context
```

---

## Commands

### `trc claude [--context]`

Launch Claude in a tracked session.

| Flag | Effect |
|------|--------|
| (none) | Normal session, no context injection |
| `--context` | Inject recent repo context |
| `--context=recent` | Recent files, chapters, prompts |
| `--context=replay` | Replay-based engineering chapters |
| `--context=<keyword>` | Only context matching the keyword |

### `trc sessions`

List all sessions with repo name, location, branch, status, and creation date.

```
 ID         REPO                  BRANCH            STATUS     CREATED
 sess_46aa  trace                 main              ENDED      May 3, 10:39 PM
             ~/Desktop/trace
 sess_2216  trace                 main              ENDED      May 3, 04:55 PM
             ~/Desktop/trace
 sess_19d0  webapp                feature/auth-v2   ENDED      May 3, 03:59 PM
             ~/projects/webapp
 7 sessions
```

### `trc status`

Show the currently active session.

### `trc resume <session-id>`

Resume a previous session. Relaunches Claude with `--resume` so it picks up where it left off. Restarts file/git tracking and prompt polling.

### `trc timeline <session-id>`

Formatted engineering timeline. Shows every event chronologically with icons:

```
 TRACE TIMELINE
 trace-2026-05-03 · sess_2216
 16:55  ▶ Session started  ~/Desktop/trace
 16:55  ⬤ Claude launched
 16:59  ✎ Files changed  repository-tracker.service.ts
 16:59  ± Diff captured  +16 -5  1 file
 17:04  ◆ Prompt captured  "prm_3240a86a"
 17:04  → Prompt correlated  1 links · repository-tracker.service.ts
 17:06  ✔ Commit  4a6dc23 "repo-trc"
 17:09  ⎇ Branch  main → new-main
 22:38  ✎ Files changed  intent-detector.service.ts
 22:39  ◆ Prompt  "push ne code keep single commit message"
 22:39  → Prompt correlated  1 links · intent-detector.service.ts
 22:39  ✔ Commit  ba1a956 "I know what you did last session"
 Duration: 6.6h · 85 events · 5 commits · 17 diffs
```

### `trc replay <session-id>`

Replay the session as engineering storytelling with chapters.

```
 TRACE REPLAY
 Session   trace-2026-05-03
 Branch    main  ·  Duration 6h 33m
 6 chapters · 5 commits · 26 files · +828 -374

 CHAPTER 1 — Repo-trc
 11m 29s · 1 files · 1 commit · +292 -40
   16:57  ◆ PROMPT "push all my code properly into this repo…"
   16:58  ✎ repo-trc  ~ repository-tracker.service.ts  +292 / -40
   17:06  ✔ "repo-trc" 4a6dc23

 CHAPTER 4 — I know what you did last session
 5h 20m · 5 files · 1 commit · +403 -264
   17:10  ✎ Claude Prompts Prompt Changes
          + prompt-poller.service.ts
          ~ claude.command.ts  ~ resume.command.ts
          ~ claude.service.ts  ~ sqlite.ts
          +265 / -192
   22:27  ◆ 5 prompts captured
   22:30  ✔ "I know what you did last session" 654ed39
```

| Option | Effect |
|--------|--------|
| `--mode=story` | Default. Chapters with intent detection |
| `--mode=chapters` | Chapter-focused view |
| `--mode=focus` | Domain-focused (use with `--focus`) |
| `--mode=timeline` | Raw timeline (legacy) |
| `--mode=diff` | Diff snapshots only |
| `--mode=commits` | Commit history only |
| `--focus=<keyword>` | Filter to keyword-related chapters |
| `--prompt=<id>` | Show only activity from one prompt |
| `--speed=slow` | Cinematic pacing |
| `--speed=fast` | Instant |
| `--show-patches` | Show inline git patches |

### `trc prompts <session-id>`

List all prompts captured during a session, with timestamps and correlation counts.

```
 Prompts — trace-2026-05-03 (sess_2216)

 16:57:55  ◆ "push all my code properly into this repo…"
              prm_3240a86a

 22:27:18  ◆ "now in my repo i only want single commit…"
              prm_5863f5d6
              → 4 files

 22:39:30  ◆ "push ne code keep single same commit message"
              prm_8c9ad3ec
              → 1 files

 8 prompts
```

### `trc why <file>`

Trace a file change back to its likely prompt. Shows linked prompts with confidence scores, related commits, and related files.

```
 Why: src/cli/commands/claude.command.ts

 Linked Prompts
   ◆ "now in my repo i only want single commit…"  40%
     prm_5863f5d6 · file in diff within prompt window
   ◆ "ok so all is fixed right…"  37%
     prm_61f360c7 · file in diff within prompt window

 Related Files
   resume.command.ts  claude.service.ts  sqlite.ts
```

### `trc prompt "<content>"`

Manually capture an engineering intent for the active session. Useful for non-Claude tools or additional annotation. Prompts are auto-captured from Claude sessions — this is for manual override only.

### `trc note "<content>"`

Shorter alias for `trc prompt`. Same behavior, less output.

### `trc context [mode]`

Display the current repository's engineering context.

```
 MAIN CONTEXT

   Current Focus
     I Know What You Did Last Session

   Important Files
     claude.command.ts  resume.command.ts
     repository-tracker.service.ts
     intent-detector.service.ts  prompt-poller.service.ts

   Engineering Chapters
     Repo-trc
       Files: repository-tracker.service.ts
       Commits: repo-trc
     I know what you did last session
       Files: prompt-poller.service.ts, claude.command.ts, ...
       Commits: I know what you did last session

   Recent Commits
     I know what you did last session
     repo-trc

   Current Branch
     main
```

| Argument | Effect |
|----------|--------|
| (none) | Recent context — files, chapters, prompts, commits |
| `recent` | Same as default |
| `replay` | Replay-based chapters and engineering story |
| `<keyword>` | Scoped to keyword (e.g. `auth`, `api`, `redis`) |

### `trc changes <session-id>`

File changes during a session, grouped by type (created, modified, deleted).

```
 File Changes — trace-2026-05-03 (sess_2216)

 Created
   + prompt-poller.service.ts
   + video/package.json
   + video/src/Root.tsx
   + video/src/components/AnimatedText.tsx
   ...

 Modified
   ~ repository-tracker.service.ts
   ~ claude.command.ts
   ~ resume.command.ts
   ~ intent-detector.service.ts

 27 files · 19 created · 8 modified · 0 deleted
```

### `trc diff <session-id>`

Git diff snapshots captured during a session.

```
 Diff Snapshots — trace-2026-05-03 (sess_2216)

 16:59:22  ± diff_723d30b2 · main
           +16 / -5 · 1 files
           repository-tracker.service.ts

 17:14:54  ± diff_bfa00900 · main
           +66 / -36 · 3 files
           claude.command.ts  resume.command.ts  claude.service.ts

 22:38:20  ± diff_3e6e8575 · main
           +133 / -70 · 1 files
           intent-detector.service.ts

 17 snapshots · +759 / -338 total
```

### `trc events <session-id>`

Raw event log for a session. Useful for debugging.

### `trc session current`

Detailed info about the active session.

### `trc session end`

Manually end the active session.

---

## Context System

Trace generates compressed repository-scoped context packs — not raw history dumps.

### How context modes work

**`recent`** — Ranks files by activity frequency and recency, includes latest replay chapters, prompts, and commits. Best for continuing recent work.

**`replay`** — Focuses on engineering chapters from the replay pipeline. Best for understanding how the codebase evolved.

**`<keyword>`** (e.g. `auth`, `api`) — Filters everything to only content matching the keyword. Promotes matching files and prompts to the top. Best for focused work in a specific area.

### Repository isolation

Each repository gets a unique identity based on its git remote URL (or filesystem path if no remote). Context from `payments-service` never leaks into `auth-service`.

Context packs are cached at `~/.trace/repos/<repo-id>/context/`.

---

## Prompt Correlation

Trace answers: "Which prompt caused this code change?"

### How it works

Prompts are captured in real-time during active sessions (polled every 12 seconds from Claude's JSONL session files). Each prompt is correlated with repository activity using:

- **Temporal proximity** — file changes near the prompt timestamp score higher
- **File path matching** — keywords from the prompt matched against changed file paths
- **Commit message matching** — prompt words matched against commit messages
- **Diff presence** — files appearing in diffs near the prompt window get boosted

Correlations are stored with confidence scores (0-100%). Use `trc why <file>` to inspect them.
