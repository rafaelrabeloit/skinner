# Skinner

**AI-powered dev loop orchestrator.** Plan your project with a PRD, then let Skinner implement it — one task at a time, with automated supervision.

Skinner orchestrates two AI agents in a loop:

<p align="center">
  <img src="docs/ralph.gif" alt="Ralph — the worker" width="200"/>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/skinner.gif" alt="Skinner — the supervisor" width="200"/>
</p>

- **Ralph** (worker) — enthusiastically reads the PRD, picks the next task, implements it, runs tests, commits, updates progress. He tries his best.
- **Skinner** (supervisor) — watches Ralph's output with a critical eye and evaluates it against the PRD. Continue, stop, or complete.

Inspired by [Ralph](https://ghuntley.com/ralph/) — the original AI worker loop concept. Skinner builds upon it with automated supervision. See also [luisbebop/ralph](https://github.com/luisbebop/ralph) and [snarktank/ralph](https://github.com/snarktank/ralph).

## What It Does

```
You → describe what you want → skinner plan → PRD.md
PRD.md → skinner work → Ralph implements → Skinner evaluates → repeat
```

### `skinner plan "description"`

Non-interactive planning. Describe what you want built — Skinner drafts a PRD with reasonable defaults and marks anything unclear with `<!-- QUESTION: ... -->` comments. Answer the questions in a follow-up call until the PRD is clean.

```bash
skinner plan "Build a CLI that sends notifications to Alexa"
# → creates PRD.md with inline questions

skinner plan "The auth uses OAuth2 client credentials, Node.js 18+"
# → refines PRD.md, resolves questions
```

### `skinner work [--loop N]`

Implementation loop. Each iteration:
1. **Ralph** reads `PRD.md` + `progress.txt`, picks the next incomplete task, implements it, runs tests, commits, updates `progress.txt`
2. **Skinner** evaluates the result against the PRD:
   - `<continue/>` — acceptable work, more tasks remain
   - `<stop_ralph/>` — quality issue, stops the loop
   - `<complete/>` — PRD fully satisfied, done

Options:
- `skinner work` — single iteration (safe default)
- `skinner work --loop 5` — up to 5 iterations
- `skinner work --loop` — run until complete or stopped
- `--eval-interval 2.5` — minutes between supervisor evaluations (default 2.5)

Interrupt anytime with `Ctrl+C`.

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
# Plan: generate PRD.md
skinner plan "Build a REST API for managing bookmarks. Kotlin, Ktor, SQLite."

# Refine: answer questions from the PRD
skinner plan "Auth uses JWT. Rate limiting at 100 req/min. Deploy with Docker."

# Work: single iteration
skinner work

# Work: up to 5 iterations
skinner work --loop 5

# Work: until complete
skinner work --loop
```

## How It Works

Skinner uses Claude Code sessions under the hood. The architecture is modular:

- **Runner** (`src/runner/`) — abstracts the AI CLI execution. Default: Claude CLI. Swappable.
- **Parser** (`src/parser/`) — parses session output for questions, reports, and supervisor decisions. Swappable.
- **Config** (`src/config.js`) — wires runner and parser implementations.

### PRD-Driven Development

The key insight: a well-written PRD with explicit completion conditions makes AI implementation reliable. Skinner enforces this by:
1. Planning phase produces a structured PRD with numbered requirements and testable conditions
2. Ralph implements one requirement at a time and updates progress
3. Skinner validates against the PRD — not vibes

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
