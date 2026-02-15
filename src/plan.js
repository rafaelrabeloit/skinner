/**
 * Plan command: produce or refine PRD.md via a planning session.
 * If PRD.md already exists, read it and ask questions based on the doc (no default question first).
 * Otherwise ask "Tell me what you want done" and build a PRD from scratch.
 */

import * as readline from "readline";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PLAN_SYSTEM, PLAN_WITH_EXISTING_PRD } from "./prompts.js";
import { runner } from "./config.js";
import { parser } from "./config.js";
import * as ui from "./ui.js";

const PRD_PATH = "PRD.md";
const PLANNING_INTRO =
  "Tell me what you want done. (Describe the goal, constraints, and how you'll know it's done.)";

/**
 * @param {string} userMessage
 * @param {string} [conversationHistory]
 * @param {boolean} [useExistingPrdPrompt] - when true, userMessage is the PRD content
 * @returns {string}
 */
function buildPlanningPrompt(userMessage, conversationHistory = "", useExistingPrdPrompt = false) {
  const history = conversationHistory
    ? `\n\nPrevious conversation:\n${conversationHistory}\n\n`
    : "";
  if (useExistingPrdPrompt) {
    return `${PLAN_WITH_EXISTING_PRD}\n\n## Existing PRD.md\n\n${userMessage}\n\nRead the PRD above. Ask the user clarifying or refining questions inside <question>...</question>, or confirm the PRD is ready.`;
  }
  return `${PLAN_SYSTEM}\n\n${history}User says: ${userMessage}\n\nProduce the PRD (save to PRD.md) or ask one clarifying question inside <question>...</question>.`;
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function runPlan(signal) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const workDir = process.cwd();
  const prdPath = join(workDir, PRD_PATH);

  const ask = (question) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve((answer || "").trim()));
    });

  let conversationHistory = "";
  let currentPrompt = PLANNING_INTRO;

  // If PRD.md exists: read it and run Claude once to get questions (or "ready"). No user input yet.
  if (existsSync(prdPath)) {
    const prdContent = await readFile(prdPath, "utf-8").catch(() => "");
    if (prdContent) {
      process.stderr.write(ui.dim("\n  Found PRD.md. Reading it and asking questions based on the doc…\n\n"));
      const result = await runner.runSession(buildPlanningPrompt(prdContent, "", true), {
        signal,
        verbose: true,
        streamJson: true,
        planMode: true,
        statusIntervalMs: 15000,
        cwd: workDir,
      });
      if (signal?.aborted) {
        rl.close();
        return;
      }
      const body = result.stdout ?? "";
      conversationHistory = `User: [existing PRD]\nClaude: ${body}\n`;
      const { question } = parser.parsePlanningOutput(body);
      if (!question) {
        process.stderr.write("\n" + ui.dim("  Planning session ended. PRD is as-is at " + workDir) + "\n");
        rl.close();
        return;
      }
      currentPrompt = question;
    }
  }

  for (;;) {
    const userInput = await ask(currentPrompt + "\n> ");
    if (signal?.aborted) {
      rl.close();
      return;
    }
    if (!userInput && !conversationHistory) {
      process.stderr.write(ui.dim("  No input. Exiting.") + "\n");
      rl.close();
      return;
    }
    if (!userInput) {
      process.stderr.write(ui.dim("  (empty reply — re-asking)") + "\n");
      continue;
    }

    const fullPrompt = buildPlanningPrompt(userInput, conversationHistory, false);

    process.stderr.write(ui.dim("  Working directory: " + workDir + "\n  Starting planning session…\n\n"));

    const result = await runner.runSession(fullPrompt, {
      signal,
      verbose: true,
      streamJson: true,
      planMode: true,
      statusIntervalMs: 15000,
      cwd: workDir,
    });

    if (signal?.aborted) {
      rl.close();
      return;
    }

    const body = result.stdout ?? "";
    const { question } = parser.parsePlanningOutput(body);
    conversationHistory += `User: ${userInput}\nClaude: ${body}\n`;

    if (question) {
      console.log("\n---\n");
      currentPrompt = question;
      continue;
    }

    process.stderr.write("\n" + ui.dim("  Planning session ended. PRD should be in PRD.md at " + workDir) + "\n");
    rl.close();
    return;
  }
}
