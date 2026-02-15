/**
 * Abstract interface for running an AI session (e.g. Claude CLI).
 * Implementations must run the session non-interactively and return
 * stdout/stderr/exit code so output can be parsed.
 *
 * @typedef {Object} RunResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number|null} code
 * @property {boolean} [terminated] - true if process was killed by signal
 *
 * @typedef {Object} RunOptions
 * @property {AbortSignal} [signal] - abort to stop the process
 * @property {Object} [env] - extra env vars
 * @property {boolean} [verbose] - stream output to process.stdout/stderr while running
 * @property {number} [statusIntervalMs] - log "still running" every N ms
 */

/**
 * @param {string} prompt - Full prompt (and optional conversation context) to send
 * @param {RunOptions} [options]
 * @returns {Promise<RunResult>}
 */
export async function runSession(prompt, options = {}) {
  throw new Error("runSession must be implemented by runner (e.g. claude.js)");
}

/**
 * Optional: spawn a session that runs in the background. Caller can read stdout
 * incrementally and kill the process. Used so Skinner can evaluate Ralph's
 * messages in runtime.
 *
 * @typedef {Object} SpawnedSession
 * @property {import('child_process').ChildProcess} child
 * @property {() => string} getStdout
 * @property {() => string} getStderr
 * @property {Promise<RunResult>} done
 *
 * @param {string} prompt
 * @param {RunOptions} [options]
 * @returns {SpawnedSession}
 */
export function spawnSession(prompt, options = {}) {
  throw new Error("spawnSession must be implemented by runner (e.g. claude.js)");
}
