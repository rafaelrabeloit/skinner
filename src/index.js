/**
 * Skinner – agent orchestrator CLI.
 * Commands: plan (PRD), work (ralph + skinner with optional --loop N).
 */

import { runPlan } from "./plan.js";
import { runWork } from "./work.js";

function printHelp() {
  const d = (s) => (process.stderr?.isTTY ? `\x1b[90m${s}\x1b[0m` : s);
  const b = (s) => (process.stderr?.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
  console.log(`
${b("Skinner")} — agent orchestrator

  ${b("plan")} ${d('"description or answers"')}
    Non-interactive planning. Pass a description to create PRD.md, or answers
    to refine an existing one. Open questions appear as <!-- QUESTION: ... -->
    comments in the PRD.

  ${b("work")} [${d("--loop [N]")}] [${d("--eval-interval MIN")}]
    Run ralph (worker) + skinner (supervisor). One iteration by default.
    ${d("--loop N")}     at most N iterations; ${d("--loop")} with no value = until complete
    ${d("--eval-interval")}  minutes between Skinner evals (default 2.5)

${d("Requirements:")} Claude CLI on PATH. For work: PRD.md in current directory.
`);
}

const DEFAULT_EVAL_INTERVAL_MIN = 2.5;

/**
 * Parse --loop from argv.
 * @returns {{ loopCount: number | null, error?: string }}
 */
function parseLoopArg(argv) {
  const i = argv.indexOf("--loop");
  if (i === -1) return { loopCount: 1 };
  const raw = argv[i + 1];
  if (raw == null || raw === "" || raw.startsWith("-")) return { loopCount: null };
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return { loopCount: null, error: "--loop must be a positive integer (e.g. --loop 5)." };
  return { loopCount: n };
}

/**
 * Parse --eval-interval from argv. Value in minutes (can be decimal). Default 2.5.
 * @returns {{ evalIntervalMs: number, error?: string }}
 */
function parseEvalIntervalArg(argv) {
  const i = argv.indexOf("--eval-interval");
  if (i === -1) return { evalIntervalMs: DEFAULT_EVAL_INTERVAL_MIN * 60 * 1000 };
  const raw = argv[i + 1];
  if (raw == null || raw === "" || raw.startsWith("-")) return { evalIntervalMs: DEFAULT_EVAL_INTERVAL_MIN * 60 * 1000 };
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return { evalIntervalMs: 0, error: "--eval-interval must be a positive number (minutes, e.g. 2.5)." };
  return { evalIntervalMs: n * 60 * 1000 };
}

/**
 * @param {string[]} argv
 */
export async function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (command === "plan") {
    const planInput = rest.join(" ").trim();
    await runPlan(planInput, controller.signal);
    return;
  }

  if (command === "work") {
    const { loopCount, error: loopError } = parseLoopArg(rest);
    const { evalIntervalMs, error: evalError } = parseEvalIntervalArg(rest);
    if (loopError) {
      console.error(loopError);
      process.exit(1);
    }
    if (evalError) {
      console.error(evalError);
      process.exit(1);
    }
    await runWork({
      loopCount,
      evalIntervalMs,
      signal: controller.signal,
      cwd: process.cwd(),
    });
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
