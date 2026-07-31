import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { runCommand } from "./commandRunner.ts";
import { ask } from "../ui/prompts.ts";
import { confirm } from "@clack/prompts";
import { isSafeSshHostAlias, redactUrlCredentials } from "./safety.ts";

type Runner = typeof runCommand;

export interface GitSetupResult {
  initialized: boolean;
  remoteLinked: boolean;
  trackingBranch: string | null;
  summary: string;
}

interface GitContext {
  skipGitInit?: boolean;
  nonInteractive?: boolean;
  gitStatus?: string;
}

/**
 * Optionally initializes a Git repository for a generated project.
 */
export async function maybeInitializeGit(targetDir: string, ctx: GitContext): Promise<GitSetupResult> {
  if (await fs.pathExists(path.join(targetDir, ".git"))) {
    const result = gitResult(true, false, null, ctx.gitStatus || "Initialized");
    ctx.gitStatus = result.summary;
    return result;
  }

  if (ctx.skipGitInit) {
    const result = gitResult(false, false, null, "Not initialized (skipped)");
    ctx.gitStatus = result.summary;
    return result;
  }

  if (ctx.nonInteractive) {
    try {
      await runCommand("git", ["init"], { cwd: targetDir });
      console.log(chalk.gray("│  Initialized empty Git repository."));
      const result = gitResult(true, false, null, "Initialized");
      ctx.gitStatus = result.summary;
      return result;
    } catch (err: any) {
      console.log(chalk.red("│  Failed to initialize git."));
      console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
      console.log(chalk.gray("│  Suggested fix: install Git or check write permissions in the project directory."));
      const result = gitResult(false, false, null, "Initialization failed");
      ctx.gitStatus = result.summary;
      return result;
    }
  }

  const doGitInit = await ask(confirm, {
    message: "Do you want to initialize a new Git repository?",
    initialValue: true,
  });

  if (!doGitInit) {
    const result = gitResult(false, false, null, "Not initialized (skipped)");
    ctx.gitStatus = result.summary;
    return result;
  }

  try {
    await runCommand("git", ["init"], { cwd: targetDir });
    console.log(chalk.gray("│  Initialized empty Git repository."));
    const result = gitResult(true, false, null, "Initialized");
    ctx.gitStatus = result.summary;
    return result;
  } catch (err: any) {
    console.log(chalk.red("│  Failed to initialize git."));
    console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
    console.log(chalk.gray("│  Suggested fix: install Git or check write permissions in the project directory."));
    const result = gitResult(false, false, null, "Initialization failed");
    ctx.gitStatus = result.summary;
    return result;
  }
}

/**
 * Connects a newly imported working tree to an existing remote without ever
 * checking out over imported files, committing, or pushing. The remote's
 * default branch becomes the local baseline/upstream, so editors show real
 * differences instead of treating every imported file as an unrelated
 * untracked file.
 */
export async function linkGitRemote(
  targetDir: string,
  remoteUrl: string,
  runner: Runner = runCommand,
  { previousRemoteUrl }: { previousRemoteUrl?: string } = {},
): Promise<GitSetupResult> {
  await fs.ensureDir(targetDir);
  if (!(await fs.pathExists(path.join(targetDir, ".git")))) await runner("git", ["init"], { cwd: targetDir });

  let currentOrigin = "";
  try {
    currentOrigin = String(await runner("git", ["remote", "get-url", "origin"], { cwd: targetDir })).trim();
  } catch { /* A missing origin is the expected first-run state. */ }

  if (currentOrigin && currentOrigin !== remoteUrl) {
    if (previousRemoteUrl && currentOrigin === previousRemoteUrl) {
      // A prior import attempt may have added the discovered URL and then
      // failed authentication before fetch completed. On resume, changing
      // only that known URL to the profile's SSH alias is safe and leaves
      // unrelated/pre-existing origins untouched.
      await runner("git", ["remote", "set-url", "origin", remoteUrl], { cwd: targetDir });
    } else {
      throw new Error(`The local repository already has a different origin (${redactUrlCredentials(currentOrigin)}). Refusing to replace it automatically.`);
    }
  }
  if (!currentOrigin) await runner("git", ["remote", "add", "origin", remoteUrl], { cwd: targetDir });

  const remoteHead = String(await runner("git", ["ls-remote", "--symref", "origin", "HEAD"], { cwd: targetDir }));
  const defaultBranch = parseDefaultBranch(remoteHead);
  await runner("git", ["fetch", "--no-tags", "origin"], { cwd: targetDir });

  if (!defaultBranch) {
    return gitResult(true, true, null, "Initialized; origin linked (empty remote)");
  }

  // Validate the server-controlled ref name with Git itself before using it
  // to build ref arguments below. Every invocation is argv-based, never a
  // shell string.
  await runner("git", ["check-ref-format", "--branch", defaultBranch], { cwd: targetDir });
  await runner("git", ["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], { cwd: targetDir });
  await runner("git", ["reset", "--mixed", `refs/remotes/origin/${defaultBranch}`], { cwd: targetDir });
  await runner("git", ["branch", "--set-upstream-to", `origin/${defaultBranch}`, defaultBranch], { cwd: targetDir });
  return gitResult(true, true, defaultBranch, `Linked to origin/${defaultBranch} (pull-only)`);
}

/**
 * Replaces only the host portion of SSH Git URLs with a local ~/.ssh/config
 * alias. HTTPS/git/file/local remotes are returned unchanged because an SSH
 * alias has no meaning for those transports.
 */
export function applyGitSshHostAlias(remoteUrl: string, alias?: string): string {
  if (!alias) return remoteUrl;
  if (!isSafeSshHostAlias(alias)) throw new Error(`Invalid Git SSH host alias: ${JSON.stringify(alias)}.`);

  const scpLike = remoteUrl.match(/^([^@\s]+)@([^:\s]+):(.+)$/);
  if (scpLike) return `${scpLike[1]}@${alias}:${scpLike[3]}`;

  const sshUrl = remoteUrl.match(/^(ssh:\/\/(?:[^@/\s]+@)?)(\[[^\]]+\]|[^/:\s]+)(:\d+)?(\/.*)$/i);
  if (sshUrl) return `${sshUrl[1]}${alias}${sshUrl[3] || ""}${sshUrl[4]}`;
  return remoteUrl;
}

function parseDefaultBranch(output: string): string | null {
  const match = output.match(/^ref:\s+refs\/heads\/(.+)\s+HEAD$/m);
  return match?.[1]?.trim() || null;
}

function gitResult(initialized: boolean, remoteLinked: boolean, trackingBranch: string | null, summary: string): GitSetupResult {
  return { initialized, remoteLinked, trackingBranch, summary };
}
