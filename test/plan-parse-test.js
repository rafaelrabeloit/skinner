#!/usr/bin/env node
/**
 * Quick test: plan parser extracts <question> and result is used for loop.
 * Run: node test/plan-parse-test.js
 */

import { parsePlanningOutput } from "../src/parser/claude.js";

const resultWithQuestion =
  "<question>What product or feature would you like me to create a PRD for? Please describe what you want to build, including the problem it solves and any key requirements you have in mind.</question>";

const { question, body } = parsePlanningOutput(resultWithQuestion);

const ok = Boolean(question && question.includes("What product") && body === resultWithQuestion);
if (!ok) {
  console.error("FAIL: expected question to be extracted and body preserved");
  process.exit(1);
}
console.log("OK: plan parser extracts question and preserves body");
console.log("  question (first 50 chars):", question.slice(0, 50) + "...");
