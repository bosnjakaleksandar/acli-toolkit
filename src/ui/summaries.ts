import chalk from "chalk";
import { describeError } from "../core/errors.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

const PROJECT_LABELS: Record<string, string> = {
  react: "React",
  nextjs: "Next.js",
  "wp-theme": "WordPress theme",
  "wp-woo": "WordPress + WooCommerce",
  "wp-react": "WordPress + React",
  "wp-existing": "Existing WordPress site",
};

export function buildProjectSummary(ctx: ProjectPlan, targetDir: string): string {
  const projectType = PROJECT_LABELS[ctx.projectType || ""] || ctx.projectType || "Unknown";
  const type = ctx.useLaravel ? `${projectType} + Laravel` : projectType;
  const rows: Array<[string, unknown]> = [
    ["Name", ctx.projectName],
    ["Type", type],
    ...(ctx.appType === "application" ? [] : ([["Environment", ctx.environment === "docker" ? "Docker Compose" : "Lando"]] as Array<[string, unknown]>)),
    ["Directory", targetDir],
  ];

  if (ctx.setupType === "existing-wp") {
    const profile = ctx.profile as any;
    rows.push(
      ["Remote", profile?.ssh?.host || "Configured staging profile"],
      ["Files", ctx.skipFiles ? "Skip" : profile?.files?.transport || "rsync"],
      ["Database", ctx.skipDatabase ? "Skip" : profile?.database?.driver || "Configured"],
    );
  }

  rows.push(["Git", ctx.skipGitInit ? "Skip initialization" : "Initialize repository"]);
  return formatRows(rows);
}

export function buildSuccessSummary(targetDir: string, ctx: ProjectPlan & { dependenciesInstalled?: boolean; warnings?: string[] }, nextSteps: string): string {
  const rows: Array<[string, unknown]> = [
    ["Location", targetDir],
    ...(ctx.appType === "application" ? [] : ([["Environment", ctx.environment === "docker" ? "Docker Compose" : "Lando"]] as Array<[string, unknown]>)),
    ["Git", ctx.skipGitInit ? "Not initialized" : "Initialized"],
    ["Dependencies", ctx.dependenciesInstalled ? "Installed" : "Manual steps may remain"],
  ];
  const warnings = ctx.warnings?.length ? `\n\n${chalk.yellow("Warnings:")}\n${ctx.warnings.map((warning) => `  - ${warning}`).join("\n")}` : "";
  return `${chalk.green(`✔ ${ctx.projectName} is ready`)}\n\n${formatRows(rows)}${warnings}\n\n${chalk.bold("Next:")}\n${nextSteps}`;
}

export interface FormatCreateErrorOptions {
  targetDir?: string;
  ownsTargetDir?: boolean;
  resumeCommand?: string | null;
  action?: string;
}

export function formatCreateError(error: any, { targetDir = "", ownsTargetDir = false, resumeCommand = null, action = "Project creation" }: FormatCreateErrorOptions = {}): string {
  const cause = error ? describeError(error) : "Unknown error";
  const lines = [chalk.redBright(`✖ ${action} failed`), "", `${chalk.bold("Cause:")} ${cause}`];

  if (error?.code && error.code !== "CLI_ERROR") lines.push(`${chalk.bold("Code:")} ${error.code}`);
  if (error?.hint) lines.push("", `${chalk.bold("Try:")} ${error.hint}`);

  if (targetDir) {
    // Once any project files may exist, they are always preserved — never
    // deleted — so a failure never destroys already-completed work (a
    // scaffolded theme, an imported database). `resumeCommand` lets the run
    // continue from the step that failed instead of starting over.
    const status = ownsTargetDir
      ? `Project directory was preserved: ${targetDir}`
      : "No project files were created; nothing to clean up.";
    lines.push("", `${chalk.bold("Cleanup:")} ${status}`);
    if (resumeCommand) lines.push("", `${chalk.bold("Resume:")} ${resumeCommand}`);
  }

  if (!error?.hint) lines.push("", chalk.bold("Try:"), "  acli doctor", "  Re-run with the same options after resolving the cause.");
  return lines.join("\n");
}

function formatRows(rows: Array<[string, unknown]>): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${chalk.dim(label.padEnd(width))}  ${value}`).join("\n");
}
