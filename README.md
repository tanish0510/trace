<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/2333aa58-466b-4d30-90c9-e056eefaa75f" /> # Trace

Local-first observability and memory for AI-assisted engineering.

Trace wraps [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and automatically tracks what you build, why you built it, and how your code evolved — without changing how you work.

```bash
trc claude    # use Claude normally — Trace handles the rest
```

When the session ends, Trace has captured every file change, git diff, commit, branch switch, and your prompts — all correlated and replayable.

## What Trace Does

- **Tracks** file changes, git diffs, commits, and branch switches during AI sessions
- **Captures** your prompts automatically from Claude's session data
- **Correlates** prompts to the code changes they caused
- **Replays** engineering sessions as narrative chapters, not raw logs
- **Generates** compressed repository context packs for future sessions
- **Isolates** each repository's memory — no cross-repo contamination

## Install

```bash
git clone https://github.com/your-username/trace.git
cd trace
npm install
npm run build
npm link
```

Requires Node.js >= 18 and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed.

## Usage

```bash
trc claude                    # start a tracked session
trc claude --context          # start with repo memory injected
trc claude --context=auth     # start with auth-focused memory

trc sessions                  # list all sessions
trc timeline <id>             # engineering timeline
trc replay <id>               # replay as engineering story
trc replay <id> --focus=auth  # replay only auth work

trc prompts <id>              # prompts from a session
trc why <file>                # which prompt caused this change?
trc context                   # view current repo context

trc find "jwt validation"     # search engineering memory
trc find "redis retry"        # fuzzy + typo-tolerant search
trc recent                    # recent activity across all repos
trc recent -n 20              # show more results
```

### Engineering Memory Search

`trc find` searches across prompts, commit messages, session names, branch names, repository names, and file paths — all ranked by relevance, recency, and repository context.

Results prioritize the current repository, support fuzzy/typo-tolerant matching, and expose session IDs for immediate `trc resume`.

See [docs/usage.md](docs/usage.md) for the full command reference.

## How It Works

```
trc claude
    |
    v
Session created + repository tracker starts
    |
    v
You work with Claude normally
    |
    v
Trace records: file changes, git diffs, commits, branches
    |
    v
Claude exits — prompts auto-extracted from Claude's session files
    |
    v
Correlation engine links prompts → files → commits → diffs
    |
    v
Everything is replayable, queryable, and context-injectable
```

All data is local. Stored in `~/.trace/`. Nothing leaves your machine.

## Architecture

See [docs/architecture.md](docs/architecture.md) for technical details.
