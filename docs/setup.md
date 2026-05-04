# Setup

## Prerequisites

- **Node.js** >= 18.0.0
- **Git** installed and available in PATH
- **Claude Code** CLI installed ([install guide](https://docs.anthropic.com/en/docs/claude-code))

## Install from Source

```bash
git clone https://github.com/tanish0510/trace.git
cd trace
npm install
npm run build
npm link
```

After `npm link`, the `trc` command is available globally.

## Verify Installation

```bash
trc --version    # should print 0.1.0
trc --help       # list all commands
```

## Data Location

All Trace data is stored locally at `~/.trace/`:

```
~/.trace/
├── trace.db          # SQLite database
├── state.json        # Active session state
├── sessions/         # Per-session data (events, diffs, prompts)
└── repos/            # Per-repo identity and context packs
```

No data is sent anywhere. Everything stays on your machine.

## Uninstall

```bash
npm unlink -g trace
rm -rf ~/.trace       # remove all stored data
```

## Updating

```bash
cd trace
git pull
npm install
npm run build
```

The `npm link` persists across rebuilds — no need to relink.

## Troubleshooting

**`trc: command not found`** — Run `npm link` again from the trace directory.

**`Error: Claude CLI not found`** — Install Claude Code from https://docs.anthropic.com/en/docs/claude-code

**Conflicts with macOS `trace` command** — The CLI is named `trc` specifically to avoid this. If you see macOS trace output, ensure `npm link` completed successfully and `which trc` points to the right binary.

**Database errors after update** — Trace auto-migrates the SQLite schema on startup. If something goes wrong, you can reset with `rm ~/.trace/trace.db` (session metadata in `~/.trace/sessions/` is preserved as JSON).
