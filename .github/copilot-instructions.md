# Trace — Copilot & AI Contributor Guidelines

Trace is a **local-first engineering memory system** for AI-assisted software development. It wraps Claude Code, records everything that happens during a session, and makes it replayable, searchable, and context-injectable.

Read this before generating code, reviewing PRs, or suggesting changes.

## Core Principles

1. **Local-first** — all data stays on the user's machine in `~/.trace/`. Zero cloud dependencies. Zero telemetry. Nothing leaves the machine.

2. **Append-only events** — every action (file change, diff, commit, prompt, branch switch) is an immutable event. Never mutate past events. Never delete events during normal operation.

3. **Repository isolation** — each repository has its own memory scope. Context from `payments-service` must NEVER leak into `auth-service`. Boost current repo, never pollute cross-repo.

4. **Engineering storytelling** — Trace reconstructs sessions as narrative chapters, not raw logs. The replay engine groups events by engineering intent (commit messages, file clusters, temporal proximity).

5. **Selective context injection** — context is explicitly activated (`trc claude --context`), never auto-injected. Engineers control what Claude sees.

## Architecture Rules

### Layer system

Trace is built in layers. Each layer depends only on layers below it:

```
Layer 7: Search & Memory Retrieval   (trc find, trc recent)
Layer 6: Context Pack System          (trc context, --context injection)
Layer 5: Prompt Intelligence          (capture, correlation, intent)
Layer 4: Replay Engine                (chapters, storytelling, playback)
Layer 3: Repository Tracking          (file watch, git diff, commits)
Layer 2: Event System                 (append-only event sourcing)
Layer 1: Session Lifecycle            (create, track, end sessions)
```

Do not create circular dependencies between layers. A service in Layer 3 should never import from Layer 5.

### Service pattern

- One service per responsibility: `*.service.ts`
- Types in `*.types.ts`, constants in `*.constants.ts`
- Each CLI command is a single file in `src/cli/commands/`
- Services are instantiated in commands, not globally

### Database

- SQLite via `better-sqlite3` with Drizzle ORM
- WAL mode enabled for concurrent reads
- Migrations are inline in `src/core/storage/sqlite.ts`
- Schema defined in `src/db/schema.ts`

### CLI output

- All terminal formatting uses Chalk — no raw ANSI codes
- Consistent icon language: `▶` start, `■` end, `✎` file change, `◆` prompt, `✔` commit, `⎇` branch, `±` diff
- Dividers use `─` characters
- Errors go to `console.error` with `chalk.red`

## Code Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESM modules (`"type": "module"`)
- `.js` extensions in all import paths
- No default exports — use named exports
- No classes for data — use interfaces and plain objects
- Services use classes with methods, not standalone functions
- No `any` types — use `unknown` and narrow

## What NOT to Do

- Do not add cloud/network dependencies
- Do not add telemetry or analytics
- Do not add global mutable singletons (except the DB connection)
- Do not add vector databases or embedding models (the search layer uses heuristic retrieval intentionally)
- Do not store secrets or credentials
- Do not modify the event sourcing model to be mutable
- Do not create files larger than ~400 lines — split into focused modules
- Do not add dependencies without justification
- Do not hardcode paths, repo names, or user-specific values

## PR Review Focus Areas

When reviewing PRs, prioritize:

1. **Repository isolation** — does this change risk leaking context across repos?
2. **Event immutability** — does this mutate or delete existing events?
3. **Local-first** — does this introduce network calls or cloud dependencies?
4. **Architecture layers** — does this respect the layer dependency order?
5. **CLI consistency** — does terminal output match existing formatting patterns?
6. **TypeScript strictness** — does this pass `tsc --noEmit` with strict mode?

## Testing

There is no test suite yet. When adding tests:

- Use Node's built-in test runner or vitest
- Test scoring/ranking logic in the search layer
- Test event aggregation and chapter building in the replay layer
- Test fuzzy matching edge cases
- Mock the SQLite database for unit tests

## Useful Context

- The `trc` CLI binary is defined in `package.json` → `"bin": { "trc": "dist/cli/index.js" }`
- Data lives in `~/.trace/` (DB, sessions, poll state, repo context)
- The background daemon (`src/daemon-entry.ts`) runs as a separate process with Unix socket IPC
- Prompts are captured by polling Claude's JSONL files in `~/.claude/projects/`
- The search engine uses SQLite FTS5 with porter tokenizer + custom multi-signal scoring
