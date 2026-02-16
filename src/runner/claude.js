/**
 * Claude CLI runner. Spawns the `claude` command non-interactively.
 * Requires the Claude CLI to be installed and on PATH.
 */

import { spawn } from "child_process";

const DEFAULT_CLI = "claude";

/** Return current timestamp for log lines: [YYYY-MM-DD HH:MM:SS] */
function timestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `[${y}-${m}-${day} ${h}:${min}:${s}]`;
}

/**
 * Parse stream-json line and optionally print assistant output (like Ralph).
 * @param {string} line
 * @param {{ resultText: string, lastMessage: string }} state
 * @param {boolean} verbose
 * @returns {void}
 */
/** Strip <question>...</question> for cleaner display. */
function stripQuestionTags(text) {
  return text.replace(/<question>([\s\S]*?)<\/question>/gi, (_, inner) => inner.trim());
}

function handleStreamJsonLine(line, state, verbose) {
  try {
    const event = JSON.parse(line);
    const label = (state.outputLabel ?? "Claude").toLowerCase();
    const prefix = () => `${timestamp()} <${label}> `;
    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          state.lastMessage = block.text.split("\n").filter(Boolean).pop() || state.lastMessage;
          if (state.accumulatedOutput != null) state.accumulatedOutput += block.text + "\n";
          if (verbose) {
            const display = stripQuestionTags(block.text).trim();
            if (display) process.stderr.write(`${prefix()}${display}\n`);
          }
        } else if (block.type === "tool_use") {
          state.lastMessage = `Using ${block.name}`;
          if (state.accumulatedOutput != null) state.accumulatedOutput += `[tool: ${block.name}]\n`;
          if (verbose) process.stderr.write(`${prefix()}Using tool: ${block.name}\n`);
        }
      }
    } else if (event.type === "result") {
      state.resultText = event.result || "";
    }
    // Skip printing system/other JSON; only assistant and result are used.
  } catch (_) {}
}

/**
 * @param {string} prompt
 * @param {import("./abstract.js").RunOptions} [options]
 * @returns {Promise<import("./abstract.js").RunResult>}
 */
export async function runSession(prompt, options = {}) {
  const {
    signal,
    env = {},
    verbose = true,
    statusIntervalMs = 15000,
    streamJson = false,
    planMode = false,
    stdio: stdioOverride,
    cwd: _cwd,
    outputLabel,
  } = options;

  // When streamJson we must pipe stdout/stderr so we capture and only show parsed messages (no raw JSON).
  // stdin is always piped (non-interactive -p mode doesn't need terminal input).
  const stdio = stdioOverride ?? ["pipe", "pipe", "pipe"];

  // Non-interactive mode: always skip permissions since stdin is piped (no user to confirm).
  const args = [
    "--dangerously-skip-permissions",
    "-p",
    ...(streamJson ? ["--output-format", "stream-json", "--verbose"] : []),
    prompt,
  ];

  const cwd = _cwd ?? process.cwd();

  return new Promise((resolve, reject) => {
    const child = spawn(DEFAULT_CLI, args, {
      env: { ...process.env, IS_SANDBOX: planMode ? undefined : "1", ...env },
      stdio,
      cwd,
    });
    if (stdio[0] === "pipe") child.stdin.end();

    let stdout = "";
    let stderr = "";
    let terminated = false;
    const startTime = Date.now();
    let statusTimer = null;
    let lineBuf = "";
    const streamState = { resultText: "", lastMessage: "", outputLabel: outputLabel ?? null };

    if (statusIntervalMs > 0 && stdio[1] === "pipe") {
      statusTimer = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const suffix = streamJson && streamState.lastMessage ? ` — ${streamState.lastMessage}` : "";
        console.error(`[session] still running... (${elapsedSec}s)${suffix}`);
      }, statusIntervalMs);
    }

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          if (terminated) return;
          terminated = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) child.kill("SIGKILL");
          }, 2000);
        },
        { once: true }
      );
    }

    if (stdio[1] === "pipe") {
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (streamJson) {
          lineBuf += text;
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) handleStreamJsonLine(line.trim(), streamState, verbose);
          }
        } else {
          if (verbose) process.stdout.write(text);
        }
      });
    }

    if (stdio[2] === "pipe") {
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (verbose && !streamJson) process.stderr.write(text);
      });
    }

    child.on("error", (err) => {
      clearInterval(statusTimer);
      reject(new Error(`Failed to run '${DEFAULT_CLI}': ${err.message}`));
    });

    child.on("close", (code) => {
      if (streamJson && lineBuf.trim()) {
        handleStreamJsonLine(lineBuf.trim(), streamState, verbose);
      }
      clearInterval(statusTimer);
      if (statusIntervalMs > 0 && stdio[1] === "pipe") {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        console.error(`[session] exited (code ${code ?? "null"}) after ${elapsedSec}s.`);
      }
      resolve({
        stdout: streamJson ? streamState.resultText : stdout,
        stderr,
        code: code ?? null,
        terminated,
      });
    });
  });
}

/**
 * Spawn a session in the background. Caller can read stdout/stderr incrementally
 * and kill the process. Used so Skinner can evaluate Ralph's messages in runtime.
 * When streamJson is true, parses stream-json and prints "Ralph: ..." messages.
 *
 * @param {string} prompt
 * @param {import("./abstract.js").RunOptions} [options]
 * @returns {import("./abstract.js").SpawnedSession}
 */
export function spawnSession(prompt, options = {}) {
  const { signal, env = {}, verbose = true, streamJson = false } = options ?? {};

  const args = [
    "--dangerously-skip-permissions",
    "-p",
    ...(streamJson ? ["--output-format", "stream-json", "--verbose"] : []),
    prompt,
  ];
  const child = spawn(DEFAULT_CLI, args, {
    env: { ...process.env, IS_SANDBOX: "1", ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();

  let stdout = "";
  let stderr = "";
  let terminated = false;
  let lineBuf = "";
  const streamState = {
    resultText: "",
    lastMessage: "",
    accumulatedOutput: "",
    outputLabel: "Ralph",
  };

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        if (terminated) return;
        terminated = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 2000);
      },
      { once: true }
    );
  }

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    if (streamJson) {
      lineBuf += text;
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) handleStreamJsonLine(line.trim(), streamState, verbose);
      }
    } else {
      if (verbose) process.stdout.write(text);
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    if (verbose && !streamJson) process.stderr.write(text);
  });

  const done = new Promise((resolve) => {
    child.on("close", (code) => {
      if (streamJson && lineBuf.trim()) {
        handleStreamJsonLine(lineBuf.trim(), streamState, verbose);
      }
      const finalStdout = streamJson
        ? (streamState.accumulatedOutput + (streamState.resultText || "")).trim() || stdout
        : stdout;
      resolve({
        stdout: finalStdout,
        stderr,
        code: code ?? null,
        terminated,
      });
    });
  });

  child.on("error", () => {
    // done will still resolve on exit
  });

  return {
    child,
    getStdout: () =>
      streamJson
        ? (streamState.accumulatedOutput + (streamState.resultText || "")).trim()
        : stdout,
    getStderr: () => stderr,
    done,
  };
}
