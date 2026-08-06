import { EnvironmentScaffoldStrategy } from "./ScaffoldStrategy.ts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../../system/gitignore.ts";
import { runCommand } from "../../system/commandRunner.ts";
import { isSafeGitUrl, isSafeSshKeyPath, redactUrlCredentials } from "../../system/safety.ts";
import { askWordPressQuestions, normalizePlugins } from "../prompts/wordpressPrompts.ts";
import { writeWordPressSetupScript } from "./wordpressSetupScript.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

export default class WordPressStrategy extends EnvironmentScaffoldStrategy {
  override async askQuestions(ctx: ProjectPlan, options?: { nonInteractive?: boolean }): Promise<ProjectPlan> {
    return askWordPressQuestions(ctx, options);
  }

  override async scaffold(targetDir: string, ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    if (!ctx.skipEnvironment) {
      await this.scaffoldEnvironment(targetDir, ctx, spinner);
    }

    const { projectName, themeRepo, themeBranch } = ctx;
    const themeDir = path.join(targetDir, "wp-content", "themes", projectName!);
    await fs.ensureDir(themeDir);

    if (themeRepo) {
      console.log(
        chalk.cyan(
          `\nCloning theme from ${redactUrlCredentials(themeRepo)}${themeBranch ? ` (${themeBranch})` : ""}...`,
        ),
      );
      try {
        let envVars = { ...process.env };
        if (ctx.sshKeyPath) {
          const resolvedKeyPath = ctx.sshKeyPath.replace(
            /^~/,
            process.env.HOME || "",
          );
          // git executes GIT_SSH_COMMAND through a shell, so an unquoted
          // key path with shell metacharacters (or one crafted to look like
          // an extra ssh option) would be interpreted rather than passed
          // through literally. Reject anything but a plain path up front.
          if (!isSafeSshKeyPath(resolvedKeyPath)) {
            throw new Error(`Unsafe SSH key path: ${resolvedKeyPath}`);
          }
          envVars.GIT_SSH_COMMAND = `ssh -i ${resolvedKeyPath} -o IdentitiesOnly=yes`;
        }

        if (!isSafeGitUrl(themeRepo)) throw new Error(`Unsafe theme repository URL: ${themeRepo}`);

        const args = ["clone"];
        if (themeBranch) args.push("--branch", themeBranch);
        args.push(themeRepo, ".");
        await runCommand("git", args, {
          cwd: themeDir,
          env: envVars,
        });
        await fs.remove(path.join(themeDir, ".git"));
        console.log(
          chalk.green(`Removed .git tracking from the cloned starter theme.`),
        );
      } catch (e: any) {
        await fs.remove(themeDir);
        throw new Error(
          `Failed to clone theme repository: ${redactUrlCredentials(themeRepo)}\n${redactUrlCredentials(e.message)}`,
        );
      }
    } else if (ctx.projectType === "wp-react") {
      await scaffoldReactTheme(themeDir, projectName!);
    } else {
      await fs.writeFile(
        path.join(themeDir, "style.css"),
        `/*\n * Theme Name: ${projectName}\n * Author: Starter CLI\n */\n`,
      );

      await fs.writeFile(
        path.join(themeDir, "index.php"),
        `<?php\n// The main template file\nget_header();\n?>\n<h1>Welcome to ${projectName}</h1>\n<?php\nget_footer();\n`,
      );

      await fs.writeFile(
        path.join(themeDir, "functions.php"),
        `<?php\n// Theme functions\n`,
      );
    }

    await writeWordPressSetupScript(targetDir, ctx);
    await scaffoldGitignore(targetDir, "wordpress");
  }

  override getTemplateType(): string {
    return "wordpress";
  }
}

export { normalizePlugins };

async function scaffoldReactTheme(themeDir: string, projectName: string): Promise<void> {
  await fs.ensureDir(path.join(themeDir, "src"));
  await fs.writeFile(path.join(themeDir, "style.css"), `/*\n * Theme Name: ${projectName}\n * Author: A-CLI\n */\n`);
  await fs.writeFile(path.join(themeDir, "index.php"), `<?php get_header(); ?>\n<div id="${projectName}-app"></div>\n<?php get_footer(); ?>\n`);
  await fs.writeFile(path.join(themeDir, "functions.php"), `<?php
add_action('wp_enqueue_scripts', function () {
    $manifest_path = get_template_directory() . '/dist/.vite/manifest.json';
    if (!file_exists($manifest_path)) return;
    $manifest = json_decode(file_get_contents($manifest_path), true);
    $entry = $manifest['src/main.jsx'] ?? null;
    if (!$entry) return;
    $script_src = get_template_directory_uri() . '/dist/' . $entry['file'];
    if (function_exists('wp_enqueue_script_module')) {
        wp_enqueue_script_module('${projectName}-app', $script_src, [], null);
    } else {
        wp_enqueue_script('${projectName}-app', $script_src, [], null, true);
    }
    foreach ($entry['css'] ?? [] as $index => $css) {
        wp_enqueue_style('${projectName}-app-' . $index, get_template_directory_uri() . '/dist/' . $css, [], null);
    }
});
`);
  await fs.writeJSON(path.join(themeDir, "package.json"), {
    name: `${projectName}-theme`,
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build" },
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: { "@vitejs/plugin-react": "^5.0.0", vite: "^7.0.0" },
  }, { spaces: 2 });
  await fs.writeFile(path.join(themeDir, "vite.config.js"), `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()], build: { manifest: true, outDir: "dist" } });\n`);
  await fs.writeFile(path.join(themeDir, "src", "main.jsx"), `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "./style.css";\n\nfunction App() {\n  return <main><h1>${projectName}</h1><p>WordPress + React theme is ready.</p></main>;\n}\n\ncreateRoot(document.getElementById("${projectName}-app")).render(<App />);\n`);
  await fs.writeFile(path.join(themeDir, "src", "style.css"), `:root { font-family: system-ui, sans-serif; }\nbody { margin: 0; }\nmain { max-width: 72rem; margin: 0 auto; padding: 2rem; }\n`);
}
