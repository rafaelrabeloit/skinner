/**
 * Plan command: produce or refine PRD.md via a non-interactive planning session.
 *
 * Usage:
 *   skinner plan "description"   — creates PRD.md from scratch (with questions/TODOs)
 *   skinner plan "answers"       — refines existing PRD.md with provided answers
 *
 * No interactive mode, no stdin. Input via CLI arg, output to PRD.md.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PLAN_SYSTEM, PLAN_WITH_EXISTING_PRD } from "./prompts.js";
import { runner } from "./config.js";
import * as ui from "./ui.js";

const PRD_PATH = "PRD.md";

/**
 * Build the prompt for Claude based on whether a PRD already exists.
 * @param {string} userInput - CLI argument (description or answers)
 * @param {string|null} existingPrd - Contents of PRD.md if it exists
 * @returns {string}
 */
function buildPrompt(userInput, existingPrd) {
  if (existingPrd) {
    return (
      `${PLAN_WITH_EXISTING_PRD}\n\n` +
      `## Existing PRD.md\n\n${existingPrd}\n\n` +
      `## User's Input\n\n${userInput}\n\n` +
      `Update the PRD based on the user's input. ` +
      `Resolve any questions/TODOs that the input answers. ` +
      `If new questions arise, add them as <!-- QUESTION: ... --> comments in the PRD. ` +
      `Write the updated PRD to PRD.md.`
    );
  }
  return (
    `${PLAN_SYSTEM}\n\n` +
    `User says: ${userInput}\n\n` +
    `Produce the PRD and save it to PRD.md. ` +
    `For anything unclear or that needs user input, add <!-- QUESTION: ... --> comments inline in the PRD. ` +
    `These questions will be answered in a subsequent call. ` +
    `The PRD should be as complete as possible with reasonable defaults where the user didn't specify.`
  );
}

/**
 * @param {string} userInput - The CLI argument text
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function runPlan(userInput, signal) {
  if (!userInput) {
    console.error(
      "Usage: skinner plan \"description or answers\"\n\n" +
      "  No PRD.md: provide a project description to generate one.\n" +
      "  PRD.md exists: provide answers to refine it.\n"
    );
    process.exit(1);
  }

  const workDir = process.cwd();
  const prdPath = join(workDir, PRD_PATH);

  let existingPrd = null;
  if (existsSync(prdPath)) {
    existingPrd = await readFile(prdPath, "utf-8").catch(() => null);
    if (existingPrd) {
      process.stderr.write(ui.dim("  Found existing PRD.md. Refining with your input…\n\n"));
    }
  } else {
    process.stderr.write(ui.dim("  No PRD.md found. Creating from scratch…\n\n"));
  }

  const prompt = buildPrompt(userInput, existingPrd);

  process.stderr.write(ui.dim("  Working directory: " + workDir + "\n  Starting planning session…\n\n"));

  const result = await runner.runSession(prompt, {
    signal,
    verbose: true,
    streamJson: true,
    planMode: true,
    statusIntervalMs: 15000,
    cwd: workDir,
  });

  if (signal?.aborted) return;

  const body = result.stdout ?? "";

  // Check if PRD.md was created/updated
  if (existsSync(prdPath)) {
    const prd = await readFile(prdPath, "utf-8").catch(() => "");
    const questions = (prd.match(/<!-- QUESTION:.*?-->/g) || []);
    if (questions.length > 0) {
      process.stderr.write("\n" + ui.dim(`  PRD.md updated with ${questions.length} open question(s):\n`));
      for (const q of questions) {
        process.stderr.write(ui.dim(`    • ${q}\n`));
      }
      process.stderr.write(ui.dim(`\n  Run: skinner plan "your answers" to resolve them.\n`));
    } else {
      process.stderr.write("\n" + ui.dim("  PRD.md is ready (no open questions). You can now run: skinner work\n"));
    }
  } else {
    process.stderr.write("\n" + ui.dim("  Warning: PRD.md was not created. Check Claude's output above.\n"));
  }
}
