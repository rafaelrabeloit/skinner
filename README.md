# Skinner

**AI-powered dev loop orchestrator.** Plan your project with a PRD, then let Skinner implement it — one task at a time, with automated supervision.

Skinner orchestrates two AI agent sessions:
- **Ralph** (worker) — reads the PRD, picks the next task, implements it, runs tests, commits
- **Skinner** (supervisor) — evaluates each iteration against the PRD and decides: continue, stop, or complete

## What It Does

```
You → describe what you want → Skinner Plan → PRD.md
PRD.md → Skinner Work → Ralph implements → Skinner evaluates → repeat
```

### `skinner plan`
Interactive planning session. Describe what you want built — Skinner drafts a PRD through a conversational loop, asking clarifying questions until the spec is solid. Outputs `PRD.md`.

### `skinner work [--loop N]`
Implementation loop. Each iteration:
1. **Ralph** reads `PRD.md` + `progress.txt`, picks the next incomplete task, implements it, runs tests, commits, updates `progress.txt`
2. **Skinner** evaluates the result against the PRD:
   - `<continue/>` — work is acceptable, more tasks remain
   - `<stop_ralph/>` — quality issue, stops the loop
   - `<complete/>` — PRD fully satisfied, done

Options:
- `skinner work` — single iteration (safe default)
- `skinner work --loop 5` — up to 5 iterations
- `skinner work --loop` — run until complete or stopped
- `--eval-interval 2.5` — minutes between supervisor evaluations (default 2.5)

Interrupt anytime with `Ctrl+C`.

## Battle-Tested Results

Skinner has built real projects with real test suites:

| Project | What It Built | Tests |
|---------|--------------|-------|
| WW2 Card Game | Full game engine ("Everything is an Effect" architecture) | 1,025 |
| Plin | React Native habit tracker app + E2E validation | 392 + 3 E2E |
| Voyeur v2 | Scrape-as-a-service (Kotlin/Ktor, Clean Architecture) | 247 |

## Requirements

- **Node.js** 18+
- **Claude CLI** installed and on `PATH` ([claude.ai/cli](https://claude.ai/cli))
- For `work`: a `PRD.md` in the current directory

## Install

```bash
npm install -g skinner
```

Or from source:

```bash
git clone https://github.com/rafaelrabeloit/skinner.git
cd skinner
npm install
npm link
```

## Usage

```bash
# Plan: generate PRD.md interactively
skinner plan

# Work: one iteration
skinner work

# Work: 5 iterations
skinner work --loop 5

# Work: until complete
skinner work --loop
```

## How It Works

Skinner uses Claude Code sessions (non-interactive, verbose) under the hood. The architecture is modular:

- **Runner** (`src/runner/`) — abstracts the AI CLI execution. Default: Claude CLI. Swappable.
- **Parser** (`src/parser/`) — parses session output for questions, reports, and supervisor decisions. Swappable.
- **Config** (`src/config.js`) — wires runner and parser implementations.

### PRD-Driven Development

The key insight: a well-written PRD with explicit completion conditions makes AI implementation reliable. Skinner enforces this by:
1. Planning phase produces a structured PRD with numbered requirements and testable conditions
2. Worker (Ralph) implements one requirement at a time, updates progress
3. Supervisor (Skinner) validates against the PRD, not vibes

### File Protocol

| File | Purpose |
|------|---------|
| `PRD.md` | The spec. Requirements, completion conditions, milestones. |
| `progress.txt` | Running log of completed tasks. Ralph appends, Skinner reads. |

## Testing

```bash
# Run with mock runner (no Claude CLI needed)
npm test

# Run a single iteration with real Claude CLI
node test/run-small-loop.js 1

# Run N iterations with mock
node test/run-small-loop.js 2 mock
```

## Writing Good PRDs

Skinner is only as good as the PRD. Tips:

- **Number your requirements** (REQ-001, REQ-002...) — Ralph needs to reference them
- **Write explicit completion conditions** — "this is done when X test passes" not "implement X"
- **Order by dependency** — Ralph picks the first incomplete task
- **Include test strategy** — Ralph runs tests after each task
- **Keep requirements atomic** — one concept per requirement

## License

MIT — see [LICENSE](LICENSE).

## Credits

Inspired by [luisbebop/ralph](https://github.com/luisbebop/ralph) and [snarktank/ralph](https://github.com/snarktank/ralph).
