<p align="center">
  <img src="assets/trace-logo.png" alt="Trace" width="480" />
</p>

<p align="center">
  <strong>Local-first memory and observability for AI-assisted engineering.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#commands">Commands</a> •
  <a href="#engineering-memory-search">Memory Search</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node" />
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="License" />
  <img src="https://img.shields.io/badge/local--first-100%25-purple" alt="Local First" />
  <img src="https://img.shields.io/badge/built_for-Claude_Code-orange" alt="Built for Claude Code" />
</p>

---

<p align="center">
  <strong>AI writes code, but context disappears between sessions.</strong><br/>
  Trace remembers everything — so you don't have to.
</p>

https://github.com/tanish0510/trace/raw/main/assets/trace-demo.mp4

---

## What is Trace?

Trace wraps [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and automatically records what you build, why you built it, and how your code evolved — without changing how you work.

When a session ends, Trace has captured every file change, git diff, commit, branch switch, and prompt — all correlated and replayable.

### Key Features

| Feature | Description |
|---------|-------------|
| **Session Recording** | Tracks file changes, git diffs, commits, and branch switches automatically |
| **Prompt Capture** | Auto-captures prompts from Claude's session data in real-time |
| **Prompt ↔ Code Correlation** | Links each prompt to the exact code changes it caused |
| **Replay Engine** | Replays engineering sessions as narrative chapters, not raw logs |
| **Memory Search** | Fuzzy, typo-tolerant search across all engineering memory |
| **Context Injection** | Generates compressed repo context packs for future Claude sessions |
| **Repository Isolation** | Each repo has its own memory — zero cross-repo contamination |
| **Background Daemon** | Always-on prompt capture across multiple concurrent sessions |

**Everything is local.** Stored in `~/.trace/`. Nothing leaves your machine.

---

## Quick Start

```bash
git clone https://github.com/tanish0510/trace.git
cd trace
npm install
npm run build
npm link
```

Requires **Node.js >= 18** and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed.

Verify the install:

```bash
trc --version       # 0.1.0
trc --help          # list all commands
```

Then start a tracked session:

```bash
cd your-project
trc claude
```

That's it. Use Claude normally. Trace handles the rest.

---

## How It Works

```
trc claude
    │
    ▼
Session created ─── repository tracker + file watcher start
    │
    ▼
You work with Claude normally
    │
    ▼
Trace records: file changes · git diffs · commits · branches
Background daemon captures prompts in real-time (every 12s)
    │
    ▼
Claude exits
    │
    ▼
Correlation engine links prompts → files → commits → diffs
    │
    ▼
Everything is replayable, searchable, and context-injectable
```

---

## Commands

### Session Lifecycle

```bash
trc claude                       # start a tracked Claude session
trc claude --context             # start with repo memory injected
trc claude --context=auth        # start with auth-focused memory only
trc sessions                     # list all sessions across repos
trc resume <session-id>          # resume a previous session
trc status                       # show active session
```

### Replay & Timeline

```bash
trc replay <id>                  # replay session as engineering chapters
trc replay <id> --show-patches   # include inline code diffs
trc replay <id> --focus=auth     # filter to auth-related work only
trc timeline <id>                # chronological event timeline
```

### Code Archaeology

```bash
trc prompts <id>                 # all prompts from a session
trc why <file>                   # which prompt caused this file change?
trc changes <id>                 # files created/modified/deleted
trc diff <id>                    # full git diff snapshots
```

### Engineering Memory Search

```bash
trc find "jwt validation"        # search across all engineering memory
trc find "redis retry"           # fuzzy, typo-tolerant matching
trc recent                       # recent activity across all repos
trc recent -n 20                 # show more results
```

### Context & Infrastructure

```bash
trc context                      # view current repo's engineering context
trc daemon status                # background prompt daemon status
trc daemon start                 # start the daemon manually
trc daemon stop                  # stop the daemon
```

---

## Engineering Memory Search

`trc find` is not grep. It's **engineering memory retrieval**.

Developers rarely remember exact prompts. They remember vague ideas, feature names, bug descriptions. Trace handles that.

```bash
$ trc find "jwt validation"

  TRACE MEMORY SEARCH — "jwt validation" — 3 results
  ─────────────────────────────────────────────────────────────────
  MATCH   SESSION ID   SESSION NAME        REPO           BRANCH
  92%     sess_19d0    auth-refactor       payments-api   feat/auth-v2
  71%     sess_b12a    token-refresh-fix   auth-service   fix/jwt-edge
  43%     sess_2216    trace-2026-05-03    trace          main
  ─────────────────────────────────────────────────────────────────

  Best Match
  92% match
    Matched:  "add JWT validation middleware"
    Repo:     payments-api  ·  Branch: feat/auth-v2

  Resume with: trc resume sess_19d0
```

**Search features:**

- **Multi-source** — searches prompts, commits, branches, session names, repo names, file paths
- **Fuzzy matching** — `trc find "jwt aut"` still finds "jwt authentication"
- **Typo-tolerant** — powered by Levenshtein distance + token stemming
- **Repository-aware** — current repo gets a ranking boost
- **Recency-weighted** — recent sessions rank higher
- **Engineering heuristics** — sessions with commits, chapters, and large blocks rank higher
- **Actionable** — every result shows session ID for `trc resume`

---

## Architecture

Trace is built in **7 layers**, each adding capability on top of the previous:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 7   Search & Memory Retrieval                    │
│  Layer 6   Context Pack System                          │
│  Layer 5   Prompt Intelligence & Correlation            │
│  Layer 4   Replay Engine & Engineering Storytelling      │
│  Layer 3   Repository Tracking (files, git, branches)   │
│  Layer 2   Event System (append-only sourcing)           │
│  Layer 1   Session Lifecycle                             │
└─────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────┐
│  SQLite (WAL) + Filesystem    ~/.trace/                  │
└─────────────────────────────────────────────────────────┘
```

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict, ES2022) |
| CLI | Commander.js |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Search | SQLite FTS5 with porter tokenizer + custom multi-signal scorer |
| File watching | chokidar |
| Git | simple-git |
| Terminal UI | Chalk |
| IPC | Unix domain sockets |

---

## Data & Privacy

All data is local. Always.

```
~/.trace/
├── trace.db              # SQLite database (WAL mode)
├── state.json            # active session pointer
├── poll-state.json       # prompt poller byte offsets
├── sessions/             # per-session event data
└── repos/                # per-repo identity + context packs
```

- Zero cloud dependencies
- Zero telemetry
- Zero network calls
- Works fully offline

---

## Documentation

| Document | Description |
|----------|-------------|
| [Usage Guide](docs/usage.md) | Full command reference with examples |
| [Setup Guide](docs/setup.md) | Installation, prerequisites, troubleshooting |
| [Architecture](docs/architecture.md) | Technical deep-dive |
| [Contributing](CONTRIBUTING.md) | Architecture overview, layer system, roadmap, feature ideas |

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Architecture overview and layer system
- Setup and development guide
- Roadmap (near-term, medium-term, long-term)
- Feature ideas for first contributions
- Code conventions

```bash
git clone https://github.com/tanish0510/trace.git
cd trace
npm install
npm run dev    # watch mode
```

---

## Roadmap

- [ ] Test suite for scoring, replay, and fuzzy matching
- [ ] `trc export` — sessions as Markdown / JSON / HTML
- [ ] `trc compare` — diff two sessions
- [ ] `trc tag` — label sessions for filtering
- [ ] Prompt capture for Cursor IDE
- [ ] Semantic search with local embeddings
- [ ] Session relationship graphs
- [ ] Multi-tool support (Copilot, Aider)
- [ ] Interactive TUI dashboard
- [ ] Team mode (opt-in shared replays)
- [ ] Plugin system for custom event types

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built for engineers who work with AI and want to remember everything.</strong>
</p>

<p align="center">
  <sub>Made with TypeScript · Powered by Claude Code · Local-first forever</sub>
</p>
