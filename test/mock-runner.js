/**
 * Mock runner for tests: no real CLI, returns configurable stdout.
 * Use via "mock" flag in run-small-loop.js (injects runSession + spawnSession).
 */

const MOCK_RALPH_STDOUT =
  "Read PRD. Implemented Task A: created test-done.txt with 'done'. Updated progress.txt. Committed.";

export async function runSession(prompt, options = {}) {
  const { signal } = options || {};
  if (signal?.aborted) {
    return { stdout: "", stderr: "", code: null, terminated: true };
  }
  // Simulate planning: no question
  if (prompt.includes("PRD") && prompt.includes("User says:")) {
    return {
      stdout: "I've written the PRD to PRD.md. Summary: minimal test PRD.",
      stderr: "",
      code: 0,
      terminated: false,
    };
  }
  // Skinner (receives only PRD, progress, Ralph messages — no other files)
  if (prompt.includes("supervisor") || prompt.includes("Ralph's messages") || prompt.includes("Do NOT read")) {
    const decision = process.env.SKINNER_MOCK_DECISION || "<continue/>";
    return {
      stdout: `${decision} Work looks good, more tasks remain.`,
      stderr: "",
      code: 0,
      terminated: false,
    };
  }
  return {
    stdout: "Mock output",
    stderr: "",
    code: 0,
    terminated: false,
  };
}

/**
 * Mock spawn: Ralph "runs" and exits almost immediately; Skinner will see his messages.
 */
export function spawnSession(prompt, options = {}) {
  const mockChild = {
    killed: false,
    kill() {
      mockChild.killed = true;
    },
  };
  const done = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        stdout: prompt.includes("@PRD.md") ? MOCK_RALPH_STDOUT : "",
        stderr: "",
        code: 0,
        terminated: false,
      });
    }, 50);
  });
  return {
    child: mockChild,
    getStdout: () => MOCK_RALPH_STDOUT,
    getStderr: () => "",
    done,
  };
}
