/**
 * Abstract interface for parsing AI session output.
 * Implementations can be swapped (e.g. for different CLI formats).
 */

/**
 * Parse planning output for a user-directed question.
 * @param {string} stdout
 * @returns {{ question: string | null, body: string }}
 */
export function parsePlanningOutput(stdout) {
  return { question: null, body: stdout };
}

/**
 * Parse supervisor (skinner) output for decision.
 * @param {string} stdout
 * @returns {{ decision: 'continue' | 'stop_ralph' | 'complete', reason?: string, body: string }}
 */
export function parseSupervisorOutput(stdout) {
  return { decision: "continue", body: stdout };
}

/**
 * Optionally extract a single "message" or reply from raw output (for display).
 * @param {string} stdout
 * @returns {string}
 */
export function formatMessageForDisplay(stdout) {
  return stdout.trim();
}
