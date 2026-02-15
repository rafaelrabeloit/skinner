/**
 * Config for runner and parser. Change these to swap implementation
 * (e.g. different CLI or output format).
 */

import { runSession as claudeRun, spawnSession as claudeSpawn } from "./runner/claude.js";
import * as claudeParser from "./parser/claude.js";

export const runner = {
  runSession: claudeRun,
  spawnSession: claudeSpawn,
};

export const parser = {
  parsePlanningOutput: claudeParser.parsePlanningOutput,
  parseSupervisorOutput: claudeParser.parseSupervisorOutput,
  formatMessageForDisplay: claudeParser.formatMessageForDisplay,
};
