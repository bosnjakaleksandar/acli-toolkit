import fs from "fs-extra";
import path from "path";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";
import { shellSingleQuote, wpCliInstallShell } from "../../wordpress/wpCliInstaller.ts";

/** Generates `scripts/install-wp-plugins.sh` (and, if requested, a WP-CLI install step) for a scaffolded WordPress project — a no-op when neither plugins nor installWpCli were requested. */
export async function writeWordPressSetupScript(targetDir: string, ctx: ProjectPlan): Promise<void> {
  if (!ctx.plugins?.length && !ctx.installWpCli) return;

  const scriptsDir = path.join(targetDir, "scripts");
  await fs.ensureDir(scriptsDir);

  const wpCommand =
    ctx.environment === "lando"
      ? "lando wp"
      : "docker compose exec -T -u www-data wordpress wp";
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    ctx.installWpCli && ctx.environment === "docker"
      ? `docker compose exec -T wordpress bash -lc ${shellSingleQuote(`command -v wp >/dev/null || { ${wpCliInstallShell()}; }`)}`
      : "",
    ...(ctx.plugins ?? []).map((plugin: string) => `${wpCommand} plugin install ${plugin} --activate`),
    "",
  ].filter(Boolean);

  await fs.writeFile(path.join(scriptsDir, "install-wp-plugins.sh"), `${lines.join("\n")}\n`, {
    mode: 0o755,
  });
}
