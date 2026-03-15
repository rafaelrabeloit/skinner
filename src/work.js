/**
 * Work command: Ralph and Skinner run TOGETHER. Ralph streams output;
 * Skinner evaluates Ralph's messages in runtime (periodic runs with only
 * PRD, progress.txt, and Ralph's messages — no other files).
 * Skinner can stop Ralph mid-run; user can interrupt everything.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { RALPH_PROMPT, SKINNER_PROMPT, SKINNER_CONTEXT_TEMPLATE } from "./prompts.js";
import { runner } from "./config.js";
import { parser } from "./config.js";
import * as ui from "./ui.js";

const PRD_PATH = "PRD.md";
const PROGRESS_PATH = "progress.txt";
const EXCERPT_LINES = 120;
const RALPH_STATUS_INTERVAL_MS = 20 * 1000; // status line every 20s so user sees progress
const RALPH_MESSAGES_TAIL_LINES = 150;

/** Cancelable sleep so we don't leave a pending timer when Ralph exits early. */
function sleep(ms, abortSignal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    if (abortSignal) {
      if (abortSignal.aborted) return onAbort();
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * @param {string} filePath
 * @param {number} maxLines
 * @returns {Promise<string>}
 */
async function readExcerpt(filePath, maxLines = EXCERPT_LINES) {
  if (!existsSync(filePath)) return "(file not found)";
  const content = await readFile(filePath, "utf-8").catch(() => "(read error)");
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}

/**
 * @param {string} fullOutput
 * @param {number} maxLines
 * @returns {string}
 */
function tailLines(fullOutput, maxLines = RALPH_MESSAGES_TAIL_LINES) {
  const lines = fullOutput.split("\n");
  if (lines.length <= maxLines) return fullOutput;
  return lines.slice(-maxLines).join("\n");
}

/**
 * Run one iteration: Ralph runs (streaming); Skinner runs periodically with
 * only PRD, progress, and Ralph's messages; Skinner can kill Ralph.
 *
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {AbortSignal} [opts.signal]
 * @param {string} opts.prdExcerpt
 * @param {string} opts.progressContent
 * @param {number} opts.evalIntervalMs - how often Skinner evaluates (default 2.5 min)
 * @param {string} [opts.workerModel] - model for Ralph
 * @param {string} [opts.supervisorModel] - model for Skinner
 * @returns {Promise<{ decision: string, reason?: string, lastRalphOutput: string, lastSkinnerReport: string }>}
 */
async function runOneIteration({ cwd, signal, prdExcerpt, progressContent, evalIntervalMs, workerModel, supervisorModel }) {
  const resolvePath = (p) => join(cwd, p);

  const ralphStream = runner.spawnSession(RALPH_PROMPT, {
    signal,
    verbose: true,
    streamJson: true,
    env: { IS_SANDBOX: "1" },
    model: workerModel,
  });

  const ralphPid = ralphStream.child.pid;
  const ralphStartTime = Date.now();
  process.stderr.write(ui.status("ralph", `Started${ralphPid != null ? ` (pid ${ralphPid})` : ""}. Output below; status every ${RALPH_STATUS_INTERVAL_MS / 1000}s. Skinner will evaluate every ${evalIntervalMs / 60000} min.\n`));

  const ralphStatusTimer = setInterval(() => {
    if (ralphStream.child.killed) return;
    const elapsed = Math.floor((Date.now() - ralphStartTime) / 1000);
    process.stderr.write(ui.status("ralph", `running… ${elapsed}s\n`));
  }, RALPH_STATUS_INTERVAL_MS);
  ralphStream.done.finally(() => clearInterval(ralphStatusTimer));

  let lastSkinnerReport = "";
  let lastDecision = "continue";
  let lastReason = "";

  const runSkinnerEval = async (ralphMessages) => {
    process.stderr.write(ui.status("skinner", "evaluating…\n"));
    const tail = tailLines(ralphMessages ?? ralphStream.getStdout());
    const context = SKINNER_CONTEXT_TEMPLATE.replace("{{prdExcerpt}}", prdExcerpt)
      .replace("{{progressContent}}", progressContent)
      .replace("{{ralphMessages}}", tail || "(no output yet)");
    const prompt = `${SKINNER_PROMPT}\n\n${context}\n\nYour decision (exactly one of: <continue/>, <stop_ralph/>, <complete/>):`;

    const result = await runner.runSession(prompt, {
      signal,
      verbose: true,
      streamJson: true,
      outputLabel: "Skinner",
      statusIntervalMs: 20 * 1000,
      model: supervisorModel,
    });
    lastSkinnerReport = parser.formatMessageForDisplay(result.stdout || "");
    const { decision, reason } = parser.parseSupervisorOutput(result.stdout || "");
    lastDecision = decision;
    lastReason = reason || "";
    if (decision === "stop_ralph") {
      try {
        ralphStream.child.kill("SIGTERM");
        setTimeout(() => {
          if (!ralphStream.child.killed) ralphStream.child.kill("SIGKILL");
        }, 2000);
      } catch (_) {}
    }
    return decision;
  };

  // Run Skinner in a loop every N seconds while Ralph runs; one eval at a time, no overlap
  const loopAbort = new AbortController();
  let ralphExited = false;
  ralphStream.done.then(() => {
    ralphExited = true;
    loopAbort.abort();
  });

  while (!ralphExited) {
    let race;
    try {
      race = await Promise.race([
        ralphStream.done.then(() => "ralph_exited"),
        sleep(evalIntervalMs, loopAbort.signal).then(() => "tick"),
      ]);
    } catch (e) {
      if (e?.message === "aborted") break;
      throw e;
    }
    if (race === "ralph_exited") break;
    if (signal?.aborted || ralphStream.child.killed) break;
    const decision = await runSkinnerEval(ralphStream.getStdout());
    if (decision === "stop_ralph") break;
  }

  // Wait for Ralph to actually exit (in case we broke from loop)
  const ralphResult = await ralphStream.done;

  if (signal?.aborted) {
    return {
      decision: "stop_ralph",
      reason: "User interrupted",
      lastRalphOutput: ralphStream.getStdout(),
      lastSkinnerReport,
    };
  }

  // If we haven't run Skinner yet (or last run was a while ago), run once more with full output
  const fullRalphOutput = ralphResult.stdout || ralphStream.getStdout() || "(no output)";
  await runSkinnerEval(fullRalphOutput);

  return {
    decision: lastDecision,
    reason: lastReason,
    lastRalphOutput: fullRalphOutput,
    lastSkinnerReport,
  };
}

/**
 * @param {object} opts
 * @param {number|null} opts.loopCount - null = run until complete/stop
 * @param {number} [opts.evalIntervalMs] - Skinner eval interval (default 2.5 min)
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.cwd] - working directory (default process.cwd())
 * @param {string} [opts.workerModel] - starting model for Ralph
 * @param {string} [opts.supervisorModel] - model for Skinner (supervisor)
 * @param {string} [opts.escalationModel] - model to escalate Ralph to on repeated failures
 * @param {number} [opts.escalationThreshold] - consecutive stop_ralph before escalating (default 2)
 */
export async function runWork({
  loopCount,
  evalIntervalMs = 2.5 * 60 * 1000,
  signal,
  cwd = process.cwd(),
  workerModel,
  supervisorModel,
  escalationModel,
  escalationThreshold = 2,
}) {
  const maxIterations = loopCount ?? 999_999;
  const resolvePath = (p) => join(cwd, p);
  let currentWorkerModel = workerModel;
  let consecutiveStops = 0;

  if (currentWorkerModel) {
    process.stderr.write(ui.dim(`Worker model: ${currentWorkerModel}`) + "\n");
  }
  if (supervisorModel) {
    process.stderr.write(ui.dim(`Supervisor model: ${supervisorModel}`) + "\n");
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (signal?.aborted) {
      process.stderr.write("\n" + ui.dim("Stopped by user.") + "\n");
      return;
    }

    const iterLabel = String(iteration);
    const maxLabel = loopCount != null ? String(loopCount) : null;
    process.stderr.write(ui.iterationHeader(iterLabel, maxLabel));

    const prdExcerpt = await readExcerpt(resolvePath(PRD_PATH));
    const progressContent = await readExcerpt(resolvePath(PROGRESS_PATH), 100);

    process.stderr.write(ui.status("ralph", "Starting. ") + ui.dim("Ctrl+C to stop.") + "\n\n");

    const { decision, reason, lastRalphOutput, lastSkinnerReport } = await runOneIteration({
      cwd,
      signal,
      prdExcerpt,
      progressContent,
      evalIntervalMs,
      workerModel: currentWorkerModel,
      supervisorModel,
    });

    if (signal?.aborted) {
      process.stderr.write("\n" + ui.dim("Stopped by user.") + "\n");
      return;
    }

    const ralphExcerpt = tailLines(lastRalphOutput, 80);
    process.stderr.write(ui.summaryBlock(iterLabel, decision, reason, ralphExcerpt, lastSkinnerReport));

    if (decision === "stop_ralph") {
      consecutiveStops++;
      if (escalationModel && currentWorkerModel !== escalationModel && consecutiveStops >= escalationThreshold) {
        currentWorkerModel = escalationModel;
        consecutiveStops = 0;
        process.stderr.write(ui.yellow(`Escalating Ralph to ${escalationModel} after ${escalationThreshold} consecutive stops.`) + "\n");
        // Don't exit — continue the loop with the stronger model
      } else {
        process.stderr.write(ui.yellow("Skinner requested to stop Ralph.") + " " + ui.dim("Exiting.") + "\n");
        return;
      }
    } else if (decision === "complete") {
      process.stderr.write(ui.green("Skinner reported PRD complete.") + " " + ui.dim("Exiting.") + "\n");
      return;
    } else {
      // continue — reset consecutive stops on success
      consecutiveStops = 0;
    }
  }

  process.stderr.write(ui.dim(`Reached max iterations (${maxIterations}).`) + "\n");
}
