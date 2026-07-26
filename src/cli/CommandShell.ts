import chalk from "chalk";
import { intro } from "@clack/prompts";
import { BRANDING } from "../ui/branding.ts";
import { mascot } from "../ui/mascot.ts";
import { describeError } from "../core/errors.ts";

/**
 * How a command renders a failure. Both variants print the same debug stack
 * and set the same exit code — they differ only in how much context the
 * failure carries:
 *
 * - "brief": one red line plus the error's own hint. For commands whose
 *   failures leave nothing behind to clean up or resume (link, pull).
 * - a `render` function: for commands that create a project directory and
 *   need to say what was preserved and how to resume (create, import) —
 *   they pass `formatCreateError`, which needs state only the command body
 *   knows (targetDir, whether scaffolding had started).
 */
export type ErrorRenderer = "brief" | ((error: any) => string);

export interface CommandShellOptions {
  /** Uppercase command name shown in the intro banner, e.g. "CREATE". */
  title: string;
  /** Emoji shown beside the title. */
  icon: string;
  /** Mascot message on failure. Omit for commands that don't show the mascot (link). */
  failureMessage?: string;
  renderError?: ErrorRenderer;
}

/**
 * The wrapper every top-level A-CLI command shares: the intro banner, a
 * catch-all that renders the failure consistently, the `ACLI_DEBUG` stack
 * dump, and the process exit code. Each of create/import/pull/link
 * previously carried its own copy of this, which is how they drifted into
 * printing failures three slightly different ways.
 *
 * `renderError` may be supplied after the fact via the handle, because
 * create/import can only build their error message from state (targetDir,
 * ownsTargetDir, resumeCommand) that doesn't exist until the body has run.
 */
export interface CommandShellHandle {
  /** Replaces how a failure is rendered, once the body knows enough to say something specific. */
  onError(render: ErrorRenderer): void;
}

export async function runCommand(options: CommandShellOptions, body: (shell: CommandShellHandle) => Promise<void>): Promise<void> {
  intro(chalk.bgCyan(chalk.black(` ${options.icon} ${BRANDING.name} ${options.title} `)));

  let renderError: ErrorRenderer = options.renderError ?? "brief";
  const handle: CommandShellHandle = {
    onError(render) { renderError = render; },
  };

  try {
    await body(handle);
  } catch (error: any) {
    // Rendered before the mascot runs, not after: a custom renderer also
    // stops the command's spinner, and leaving it spinning underneath the
    // mascot animation is what the hand-written versions were careful to
    // avoid. The message is only printed once the mascot has finished.
    const message = renderError === "brief"
      ? [chalk.red(`✖ ${describeError(error)}`), ...(error?.hint ? [chalk.gray(`  ${error.hint}`)] : [])].join("\n")
      : renderError(error);
    if (options.failureMessage) {
      await mascot.show("error", options.failureMessage);
      mascot.stop();
    }
    console.log(message);
    if (process.env.ACLI_DEBUG === "1" && error?.stack) console.error(error.stack);
    process.exitCode = error?.exitCode || 1;
  }
}
