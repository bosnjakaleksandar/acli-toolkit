import chalk from "chalk";
import { describeError } from "../core/errors.ts";

const PROJECT_LABELS = {
  react: "React",
  nextjs: "Next.js",
  "wp-theme": "WordPress theme",
  "wp-woo": "WordPress + WooCommerce",
  "wp-react": "WordPress + React",
  "wp-existing": "Existing WordPress site",
};

export function buildProjectSummary(ctx, targetDir) {
  const projectType = PROJECT_LABELS[ctx.projectType] || ctx.projectType || "Unknown";
  const type = ctx.useLaravel ? `${projectType} + Laravel` : projectType;
  const rows = [
    ["Name", ctx.projectName],
    ["Type", type],
    ...(ctx.appType === "application" ? [] : [["Environment", ctx.environment === "docker" ? "Docker Compose" : "Lando"]]),
    ["Directory", targetDir],
  ];

  if (ctx.setupType === "existing-wp") {
    rows.push(
      ["Remote", ctx.profile?.ssh?.host || "Configured staging profile"],
      ["Files", ctx.skipFiles ? "Skip" : ctx.profile?.files?.transport || "rsync"],
      ["Database", ctx.skipDatabase ? "Skip" : ctx.profile?.database?.driver || "Configured"],
    );
  }

  rows.push(["Git", ctx.skipGitInit ? "Skip initialization" : "Initialize repository"]);
  return formatRows(rows);
}

export function buildSuccessSummary(targetDir, ctx, nextSteps) {
  const rows = [
    ["Location", targetDir],
    ...(ctx.appType === "application" ? [] : [["Environment", ctx.environment === "docker" ? "Docker Compose" : "Lando"]]),
    ["Git", ctx.skipGitInit ? "Not initialized" : "Initialized"],
    ["Dependencies", ctx.dependenciesInstalled ? "Installed" : "Manual steps may remain"],
  ];
  const warnings = ctx.warnings?.length ? `\n\n${chalk.yellow("Warnings:")}\n${ctx.warnings.map((warning) => `  - ${warning}`).join("\n")}` : "";
  return `${chalk.green(`✔ ${ctx.projectName} is ready`)}\n\n${formatRows(rows)}${warnings}\n\n${chalk.bold("Next:")}\n${nextSteps}`;
}

export function formatCreateError(error, { targetDir = "", ownsTargetDir = false, resumeCommand = null, action = "Project creation" } = {}) {
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

function formatRows(rows) {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${chalk.dim(label.padEnd(width))}  ${value}`).join("\n");
}
