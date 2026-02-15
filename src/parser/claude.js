/**
 * Parser for Claude CLI output: questions, supervisor decisions, display formatting.
 */

const QUESTION_RE = /<question>([\s\S]*?)<\/question>/i;
const STOP_RALPH_RE = /<stop_ralph\s*\/?>/i;
const COMPLETE_RE = /<complete\s*\/?>/i;
const CONTINUE_RE = /<continue\s*\/?>/i;

/**
 * @param {string} stdout
 * @returns {{ question: string | null, body: string }}
 */
export function parsePlanningOutput(stdout) {
  const match = stdout.match(QUESTION_RE);
  const question = match ? match[1].trim() : null;
  return { question, body: stdout };
}

/**
 * @param {string} stdout
 * @returns {{ decision: 'continue' | 'stop_ralph' | 'complete', reason?: string, body: string }}
 */
export function parseSupervisorOutput(stdout) {
  let decision = "continue";
  if (STOP_RALPH_RE.test(stdout)) decision = "stop_ralph";
  else if (COMPLETE_RE.test(stdout)) decision = "complete";

  const reasonMatch = stdout.match(
    new RegExp(
      `(?:<stop_ralph\\s*/?>|<complete\\s*/?>|<continue\\s*/?>)\\s*[\\s\\S]*?([^.]+(?:\\.[^\\s]+)*)`,
      "i"
    )
  );
  const reason = reasonMatch ? reasonMatch[1].trim().slice(0, 200) : undefined;

  return { decision, reason, body: stdout };
}

/**
 * @param {string} stdout
 * @returns {string}
 */
export function formatMessageForDisplay(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return trimmed;
  const lines = trimmed.split("\n");
  const out = [];
  for (const line of lines) {
    out.push(line);
  }
  return out.join("\n");
}
