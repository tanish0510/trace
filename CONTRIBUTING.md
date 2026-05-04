# Contributing to Trace

Thanks for your interest in Trace. This guide covers the architecture, how to get set up, and where the project is headed.

## Architecture Overview

Trace is a local-first CLI tool that wraps Claude Code and records everything that happens during an AI-assisted engineering session — file changes, git diffs, commits, prompts, and correlations — then makes it all replayable, searchable, and injectable as context.

```
┌──────────────────────────────────────────────────────┐
│  CLI Layer  (Commander.js)                           │
│  trc claude · sessions · replay · find · recent ...  │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│  Core Services                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ Session  │ │ Events   │ │ Prompts  │ │ Search │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ Replay   │ │ Context  │ │ Repo     │ │ Daemon │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│  Storage                                             │
│  SQLite (better-sqlite3 + Drizzle ORM) + filesystem  │
│  ~/.trace/trace.db · ~/.trace/sessions/ · ~/.trace/  │
└──────────────────────────────────────────────────────┘
```

### Key principles

- **Local-first** — all data in `~/.trace/`, nothing leaves the machine
- **Event-sourced** — every action is an append-only event
- **Repository-isolated** — no cross-repo memory contamination
- **Zero-config** — `trc claude` is the only entry point needed

### Tech stack

| Component | Tool |
|-----------|------|
| Language | TypeScript (strict, ES2022) |
| CLI framework | Commander.js |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| File watching | chokidar |
| Git operations | simple-git |
| Terminal output | Chalk |
| Search | SQLite FTS5 + custom scoring |

## Layer System

Trace was built in layers, each adding a capability on top of the previous ones.

### Layer 1 — Session Lifecycle

Core session management. Creating, tracking, ending, and persisting sessions.

```
src/core/session/        → session.service.ts, session.repository.ts
src/core/state/          → state.service.ts (active session tracking)
src/core/storage/        → sqlite.ts (database, migrations)
src/db/                  → schema.ts (Drizzle schema)
```

### Layer 2 — Event System

Append-only event sourcing. Every file change, diff, commit, and branch switch is recorded as a typed event.

```
src/core/events/         → event.service.ts, event.repository.ts, event.types.ts
```

### Layer 3 — Repository Tracking

Real-time file watching and git integration. Detects file creates/edits/deletes, captures git diffs with full patches, records commits, tracks branch switches.

```
src/core/repository/     → repository-tracker.service.ts, watcher.service.ts
                           git.service.ts, diff.service.ts
```

### Layer 4 — Replay Engine

Reconstructs engineering sessions as narrative chapters. Groups events into logical blocks, detects engineering intent from commit messages and file patterns, supports multiple playback modes.

```
src/core/replay/         → replay-engine.service.ts, replay.service.ts
  aggregation/           → chapter-builder, activity-aggregator, engineering-block-builder
  intelligence/          → intent-detector, focus-analyzer, noise-filter, replay-summary
  playback.service.ts, timeline-builder.service.ts, snapshot.service.ts
```

### Layer 5 — Prompt Intelligence

Auto-captures prompts from Claude's JSONL session files. Correlates prompts to code changes using temporal proximity, file path matching, commit message overlap, and diff presence.

```
src/core/prompts/        → prompt-poller.service.ts, prompt-capture.service.ts
                           correlation-engine.service.ts, prompt-intelligence.service.ts
                           prompt-extractor.service.ts, prompt-repository.ts
                           poll-state.ts
```

### Layer 6 — Context Pack System

Generates compressed, repository-scoped context for injection into new Claude sessions. Supports `recent`, `replay`, and keyword-scoped modes. Ranks files by activity frequency and recency.

```
src/core/context/        → context-engine.service.ts, context-pack-builder.service.ts
                           context-compression.service.ts, context-selector.service.ts
                           relevance-engine.service.ts, repository-context.service.ts
                           context-renderer.service.ts
```

### Layer 7 — Search & Memory Retrieval

Fuzzy, typo-tolerant search across all engineering memory. SQLite FTS5 indexing, multi-signal relevance scoring (text similarity, recency, repo context, engineering importance), and formatted terminal output.

```
src/core/search/         → search-engine.service.ts, search-index.service.ts
                           relevance-scorer.service.ts, fuzzy-matcher.service.ts
                           retrieval.service.ts, prompt-search.service.ts
                           search-renderer.service.ts
```

### Background Daemon

Persistent prompt capture across sessions. Uses `fs.watch` on Claude's project directories, Unix socket IPC, PID file management, and auto-shutdown after idle timeout.

```
src/core/daemon/         → daemon.service.ts, daemon.client.ts
src/daemon-entry.ts      → daemon process entry point
```

## Setup Guide

### Prerequisites

- Node.js >= 18
- Git
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Install

```bash
git clone https://github.com/your-username/trace.git
cd trace
npm install
npm run build
npm link
```

### Development

```bash
npm run dev          # watch mode — recompiles on save
trc --help           # verify CLI works
```

The build output goes to `dist/`. The `npm link` symlink points to `dist/cli/index.js`, so rebuilds take effect immediately.

### Project structure

```
src/
├── cli/
│   ├── index.ts                 # CLI entry point, command registration
│   └── commands/                # one file per command
├── core/
│   ├── session/                 # session lifecycle
│   ├── events/                  # event sourcing
│   ├── repository/              # file watching + git
│   ├── replay/                  # replay engine + intelligence
│   ├── prompts/                 # prompt capture + correlation
│   ├── context/                 # context pack generation
│   ├── search/                  # memory search + retrieval
│   ├── daemon/                  # background prompt daemon
│   ├── integrations/claude/     # Claude CLI integration
│   ├── state/                   # active session state
│   └── storage/                 # SQLite connection + migrations
├── db/
│   └── schema.ts                # Drizzle ORM schema
└── daemon-entry.ts              # daemon process entry
```

### Data location

All runtime data lives in `~/.trace/`:

```
~/.trace/
├── trace.db              # SQLite database (WAL mode)
├── state.json            # active session pointer
├── poll-state.json       # prompt poller byte offsets
├── sessions/             # per-session JSON/JSONL files
└── repos/                # per-repo identity + context packs
```

### Running tests

There is no test suite yet. This is a good first contribution — see the roadmap below.

### Code conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESM modules (`"type": "module"` in package.json)
- Services follow the `*.service.ts` naming pattern
- Types go in `*.types.ts`, constants in `*.constants.ts`
- Each CLI command is a single file in `src/cli/commands/`
- Chalk for all terminal output — no raw `console.log` formatting
- SQLite migrations are inline in `src/core/storage/sqlite.ts`

## Roadmap

### Near-term

- [ ] **Test suite** — unit tests for scoring, fuzzy matching, event aggregation, chapter building
- [ ] **`trc export`** — export sessions as Markdown, JSON, or HTML
- [ ] **`trc compare`** — diff two sessions to see what changed between attempts
- [ ] **`trc tag`** — tag sessions with labels for easier filtering
- [ ] **`trc gc`** — garbage collect old sessions and indexes
- [ ] **Prompt capture for Cursor** — extend the poller to support Cursor IDE sessions

### Medium-term

- [ ] **Semantic search** — embeddings-based retrieval (local, e.g. ONNX) alongside the existing fuzzy search
- [ ] **Session graphs** — visualize session relationships (branches, resumes, forks)
- [ ] **Multi-tool support** — track Copilot, Aider, or other AI coding tools
- [ ] **TUI dashboard** — interactive terminal UI for browsing sessions and replays
- [ ] **Webhook/notification system** — post session summaries to Slack, Discord, etc.

### Long-term

- [ ] **Team mode** — share session replays and context packs across a team (opt-in)
- [ ] **Plugin system** — custom event types, custom replay renderers, custom context builders
- [ ] **Session analytics** — trends across sessions (prompt patterns, file hotspots, productivity metrics)
- [ ] **Graph-based memory** — knowledge graph linking prompts, files, commits, and concepts across repos

## Feature Ideas

If you want to contribute but aren't sure where to start:

**Good first issues:**
- Add `--json` output flag to `trc sessions`, `trc find`, `trc recent`
- Add `trc prompts --count` to show prompt counts without full content
- Improve the `trc why` confidence scoring with better heuristics
- Add session duration display to `trc sessions` table

**Bigger projects:**
- Build a `trc web` command that serves a local web UI for browsing sessions
- Add SQLite FTS5 index auto-rebuild on new session events (currently rebuilds on every search)
- Implement incremental index updates instead of full rebuild in `SearchIndexService`
- Add `trc replay --export=html` with syntax-highlighted patches
- Build a `trc doctor` command that validates database integrity and repairs broken state

**Architecture improvements:**
- Move SQLite migrations from inline SQL to Drizzle Kit managed migrations
- Add structured logging (currently uses `console.log` directly)
- Add graceful shutdown handling across all services
- Separate the daemon into its own package for independent versioning

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes — keep commits focused and descriptive
3. Run `npm run build` and verify there are no TypeScript errors
4. Test your changes manually with `trc` commands
5. Open a PR with a clear description of what changed and why

There are no CI checks yet, so the build step is your verification. If you add tests, even better.
