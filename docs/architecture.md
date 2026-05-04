# Architecture

## Overview

Trace is built in layers, each adding capability without breaking previous ones.

| Layer | Name | What It Does |
|-------|------|-------------|
| 1 | Session Engine | Session lifecycle, Claude wrapper, resume |
| 2 | Event System | Append-only events, timelines, dual persistence |
| 3 | Repository Tracking | File watching, git diffs, commits, branches |
| 4 | Replay Engine | Engineering storytelling, chapters, focus mode |
| 5 | Prompt Intelligence | Auto-capture, correlation engine, engineering intent |
| 6 | Context Packs | Repository-scoped memory, selective injection |

## Project Structure

```
src/
├── cli/                           # CLI commands (Commander.js)
│   ├── index.ts
│   └── commands/
│       ├── claude.command.ts      # trc claude [--context]
│       ├── sessions.command.ts    # trc sessions
│       ├── status.command.ts      # trc status
│       ├── resume.command.ts      # trc resume
│       ├── events.command.ts      # trc events
│       ├── timeline.command.ts    # trc timeline
│       ├── changes.command.ts     # trc changes
│       ├── diff.command.ts        # trc diff
│       ├── replay.command.ts      # trc replay
│       ├── prompt.command.ts      # trc prompt
│       ├── prompts.command.ts     # trc prompts
│       ├── why.command.ts         # trc why
│       ├── note.command.ts        # trc note
│       └── context.command.ts     # trc context
│
├── core/
│   ├── session/                   # Session lifecycle
│   ├── events/                    # Append-only event system
│   ├── repository/                # File watcher + git tracking
│   ├── replay/                    # Replay engine + intelligence
│   │   ├── aggregation/           # Activity windows, blocks, chapters
│   │   └── intelligence/          # Intent detection, noise filter, focus
│   ├── prompts/                   # Prompt capture + correlation
│   ├── context/                   # Context packs + repo isolation
│   ├── storage/                   # SQLite connection + migrations
│   ├── state/                     # Active session state
│   └── integrations/claude/       # Claude CLI wrapper
│
└── db/
    └── schema.ts                  # Drizzle ORM schema
```

## Design Principles

**Wrapper, not interceptor** — Trace wraps Claude CLI with `child_process.spawn()` and `stdio: "inherit"`. It never parses Claude's output or injects into the terminal. Prompts are extracted post-session from Claude's own JSONL files.

**Append-only events** — All activity (file changes, diffs, commits, prompts) is recorded as immutable events. Nothing is mutated. This enables deterministic replay.

**Dual persistence** — SQLite for structured queries + JSON/JSONL on the filesystem for portability and debugging. Both always in sync.

**Git as source of truth** — The filesystem watcher (chokidar) triggers checks, but Git determines what actually changed. Diffs come from `git diff`, not file comparisons.

**Repository isolation** — Each repo gets a fingerprinted identity (based on git remote URL or path hash). Context packs, sessions, and memory are scoped per-repo. No cross-contamination.

**Selective context injection** — Context is never auto-injected into Claude. It only activates when you explicitly pass `--context`.

**Heuristic intelligence** — All inference (intent detection, prompt correlation, file relevance) uses timestamps, file paths, branch names, and commit messages. No LLMs, no embeddings, no vector DBs.

## Data Flow

### Session lifecycle

```
trc claude
  → SessionService.createSession()
  → EventService.sessionStarted()
  → RepositoryTrackerService.start()
    → WatcherService (chokidar)  → FILES_CHANGED events
    → GitService (polling 5s)    → COMMIT_CREATED, GIT_BRANCH_CHANGED events
    → DiffService                → GIT_DIFF_CAPTURED events
  → ClaudeService.launch()      → stdio: "inherit" (transparent)
  → [Claude exits]
  → PromptExtractorService      → reads ~/.claude/projects/<repo>/<uuid>.jsonl
  → PromptIntelligenceService   → correlates prompts to activity
  → SessionService.endSession()
```

### Replay pipeline

```
Raw Events
  → NoiseFilterService          (remove lockfiles, generated files)
  → ActivityAggregatorService   (group into time-bounded windows)
  → EngineeringBlockBuilder     (transform to blocks with intent)
  → IntentDetectorService       (infer domain from files/branch/commits)
  → ChapterBuilderService       (split at commit boundaries)
  → FocusAnalyzerService        (optional: filter by keyword)
  → ReplayRendererService       (cinematic chapter output)
```

### Context generation

```
RepositoryContextService.identify()   (fingerprint + registry)
  → SessionService + EventService     (fetch repo-scoped sessions + events)
  → RelevanceEngineService            (score files by activity + recency)
  → ContextCompressionService         (dedupe, cap, prioritize)
  → ContextPackBuilderService         (assemble markdown sections)
  → ContextRendererService            (CLI display or Claude injection)
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `sessions` | Session lifecycle (id, repo, branch, status, timestamps) |
| `events` | Append-only event log (type, payload, timestamp) |
| `diffs` | Git diff snapshots (files, insertions, deletions, patch) |
| `prompts` | Captured prompts (content, timestamp) |
| `prompt_correlations` | Prompt-to-activity links (file, commit, event, confidence) |

Migrations run automatically on first database access.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js >= 18 |
| CLI | Commander.js |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| File Watching | Chokidar |
| Git | simple-git |
| Terminal Styling | Chalk |
