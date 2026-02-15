/**
 * Simple CLI UI helpers. Uses ANSI codes when stderr/stdout is a TTY.
 */

const isTTY = process.stderr?.isTTY === true;

function ansi(code) {
  return isTTY ? `\x1b[${code}m` : "";
}

export const dim = (s) => `${ansi(90)}${s}${ansi(0)}`;
export const bold = (s) => `${ansi(1)}${s}${ansi(0)}`;
export const cyan = (s) => `${ansi(36)}${s}${ansi(0)}`;
export const green = (s) => `${ansi(32)}${s}${ansi(0)}`;
export const yellow = (s) => `${ansi(33)}${s}${ansi(0)}`;

/** Single line separator (dim) */
export function line(width = 52) {
  return dim("─".repeat(width));
}

/** Section title with lines */
export function section(title, width = 52) {
  const pad = Math.max(0, width - title.length - 2);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return "\n" + dim("┌" + "─".repeat(width) + "┐\n│") + " ".repeat(left) + bold(title) + " ".repeat(right) + dim("│\n└" + "─".repeat(width) + "┘");
}

/** Compact iteration header */
export function iterationHeader(iterLabel, maxLabel) {
  const tag = maxLabel ? ` ${iterLabel}/${maxLabel}` : ` ${iterLabel}`;
  return "\n" + cyan("◆") + " " + bold("Iteration") + dim(tag) + "\n" + line() + "\n";
}

/** Status line (e.g. "Ralph started" or "Skinner evaluating") */
export function status(agent, message) {
  return dim(`  ${agent}: `) + message + "\n";
}

/** Decision badge for summary */
export function decisionBadge(decision) {
  if (decision === "complete") return green("complete");
  if (decision === "stop_ralph") return yellow("stop");
  return cyan("continue");
}

/** Summary block after an iteration */
export function summaryBlock(iterLabel, decision, reason, ralphExcerpt, skinnerReport) {
  const excerpt = (ralphExcerpt || "").slice(-1200).trim();
  const report = (skinnerReport || "").trim();
  const out = [
    "\n" + line(),
    bold("  Summary") + dim(` · iteration ${iterLabel}`) + " · " + decisionBadge(decision) + (reason ? dim(` — ${reason}`) : ""),
    line(),
    dim("  Ralph (excerpt):"),
    excerpt ? "  " + excerpt.split("\n").join("\n  ") : dim("  (no output)"),
    "\n" + dim("  Skinner:"),
    report ? "  " + report.split("\n").join("\n  ") : dim("  (no report)"),
    "\n" + line() + "\n",
  ];
  return out.join("\n");
}
