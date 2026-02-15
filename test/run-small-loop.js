#!/usr/bin/env node
/**
 * Run a small work loop (1 or 2 iterations) to validate skinner.
 * Usage:
 *   node test/run-small-loop.js [1|2] [mock]
 * - 1 or 2: number of iterations (default 1)
 * - "mock": use mock runner (no Claude CLI required)
 *
 * Without "mock", runs from test/fixtures with real Claude (needs PRD.md, progress.txt there).
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runWork } from "../src/work.js";
import { runSession as mockRun, spawnSession as mockSpawn } from "./mock-runner.js";
import * as config from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

const args = process.argv.slice(2);
const loopArg = args.find((a) => a === "1" || a === "2") || "1";
const useMock = args.includes("mock");
const loopCount = parseInt(loopArg, 10);

if (useMock) {
  config.runner.runSession = mockRun;
  config.runner.spawnSession = mockSpawn;
  console.log("Using mock runner (no Claude).");
}

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

console.log(`Running work --loop ${loopCount} in ${fixturesDir}\n`);

await runWork({
  loopCount,
  signal: controller.signal,
  cwd: fixturesDir,
});

console.log("\nSmall loop test finished.");
