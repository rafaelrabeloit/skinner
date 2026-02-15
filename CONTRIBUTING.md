# Contributing

Contributions are welcome! Please open an issue or PR.

## Development

```bash
git clone https://github.com/rafaelrabeloit/skinner.git
cd skinner
npm install
npm test
```

## Architecture

- `src/index.js` — CLI entry point, argument parsing
- `src/plan.js` — Planning session (PRD generation)
- `src/work.js` — Work loop (Ralph + Skinner orchestration)
- `src/runner/` — AI CLI abstraction (Claude CLI default)
- `src/parser/` — Output parsing abstraction
- `src/config.js` — Dependency wiring
- `src/prompts.js` — System prompts for Ralph and Skinner
- `src/ui.js` — Terminal output formatting

## Adding a New Runner

1. Create `src/runner/your-runner.js` implementing the abstract interface
2. Wire it in `src/config.js`
