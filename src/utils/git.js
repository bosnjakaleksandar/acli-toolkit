import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName } from "./templateMap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function getGitignore(type) {
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

export async function scaffoldGitignore(targetDir, type) {
  const content = await getGitignore(type);
  await fs.writeFile(path.join(targetDir, ".gitignore"), content);
}
