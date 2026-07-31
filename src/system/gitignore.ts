import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName } from "../environments/templateMap.ts";
import { runCommand } from "./commandRunner.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function getGitignore(type: string): Promise<string> {
  const templateName = resolveTemplateName(type);
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "gitignore",
    `${templateName}.gitignore.tpl`,
  );

  try {
    if (await fs.pathExists(templatePath)) {
      return await fs.readFile(templatePath, "utf-8");
    }
  } catch (e) {
    // Fallback to default content if template is missing or unreadable
  }

  return `# Default gitignore\nnode_modules/\n*.log\n.DS_Store\n`;
}

export async function scaffoldGitignore(targetDir: string, type: string): Promise<void> {
  const content = await getGitignore(type);
  await fs.writeFile(path.join(targetDir, ".gitignore"), content);
}

/**
 * Builds an import-safe .gitignore. A fetched repository's tracked file is
 * authoritative and stays intact; local/import-generated rules and missing
 * template patterns are appended. If there is no remote baseline and the
 * only local rule is the `.acli/` entry created by writeLink(), the complete
 * project template is materialized instead of leaving that one-line file.
 */
export async function mergeGitignoreForImport(targetDir: string, type: string): Promise<void> {
  const gitignorePath = path.join(targetDir, ".gitignore");
  const current = await fs.pathExists(gitignorePath) ? await fs.readFile(gitignorePath, "utf8") : "";
  const template = await getGitignore(type);
  let baseline: string | null = null;

  if (await fs.pathExists(path.join(targetDir, ".git"))) {
    try {
      baseline = String(await runCommand("git", ["show", "HEAD:.gitignore"], { cwd: targetDir }));
    } catch { /* A new/empty remote or a repository without .gitignore. */ }
  }

  const merged = mergeGitignoreContents(current, template, baseline);
  await fs.writeFile(gitignorePath, merged);
}

export function mergeGitignoreContents(current: string, template: string, baseline: string | null = null): string {
  const currentRules = activeRules(current);
  const baselineRules = activeRules(baseline || "");

  if (!baseline?.trim() && (currentRules.size === 0 || (currentRules.size === 1 && currentRules.has(".acli/")))) {
    return ensureFinalNewline(template);
  }

  const primary = baseline?.trim() ? baseline : current;
  const known = activeRules(primary);
  const additions: string[] = [];
  for (const rule of [...currentRules, ...activeRules(template)]) {
    if (known.has(rule)) continue;
    known.add(rule);
    additions.push(rule);
  }
  if (!additions.length) return ensureFinalNewline(primary);
  return `${primary.trimEnd()}\n\n# A-CLI additions\n${additions.join("\n")}\n`;
}

function activeRules(content: string): Set<string> {
  return new Set(content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
}

function ensureFinalNewline(content: string): string {
  return `${content.trimEnd()}\n`;
}
