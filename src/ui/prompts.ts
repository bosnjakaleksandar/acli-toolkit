import { text, select, confirm, isCancel, cancel, log } from "@clack/prompts";
import type { SelectionMenu } from "../remote/CoolifyProjectHost.ts";
import fs from "fs-extra";
import { mascot } from "./mascot.ts";
import { DEFAULT_WORDPRESS_VERSION } from "../config/defaults.ts";

export async function ask<F extends (options: any) => Promise<any>>(promptFn: F, options: Parameters<F>[0]): Promise<Exclude<Awaited<ReturnType<F>>, symbol>> {
  const result = await promptFn(options);
  if (isCancel(result)) {
    await mascot.show("cancelled", "Operation cancelled.");
    mascot.stop();
    cancel("Operation cancelled.");
    process.exit(0);
  }
  return result;
}

/**
 * Mirrors a server `project` CLI "which one?" menu as an A-CLI prompt, then
 * shows the profile setting that answers it permanently.
 */
export async function askSelectionMenu(menu: SelectionMenu, { project, profileName }: { project: string; profileName: string }): Promise<number> {
  const number = (await ask(select, {
    message: `${project} has several ${menu.what}. Which one does WordPress use?`,
    options: menu.options.map((option) => ({
      value: option.number,
      label: option.names[0]!,
      ...(option.names.length > 1 && option.names.at(-1) !== option.names[0] ? { hint: option.names.at(-1) } : {}),
    })),
  })) as number;
  const name = menu.options.find((option) => option.number === number)?.names.at(-1);
  log.info(`To skip this question next time, set coolify.${menu.key}: ${name} in profile "${profileName}".`);
  return number;
}

export async function askMysqlVersion(): Promise<string> {
  return (await ask(select, {
    message: "Choose MySQL version:",
    options: [
      { label: "8.0 (Recommended)", value: "8.0" },
      { label: "5.7", value: "5.7" },
      { label: "MariaDB 11.4", value: "mariadb:11.4" },
    ],
  })) as string;
}

export async function askWpVersion(): Promise<string> {
  return ask(text, {
    message: `WordPress version (pinned default ${DEFAULT_WORDPRESS_VERSION}, or "latest"):`,
    initialValue: DEFAULT_WORDPRESS_VERSION,
  });
}

export async function askSshKeyPath(): Promise<string> {
  return ask(text, {
    message:
      "SSH Private Key Path (leave empty to use default system key, e.g., ~/.ssh/key_name):",
    initialValue: "",
    validate: (value: string | undefined) => {
      if (value) {
        const resolvedPath = value.replace(/^~/, process.env.HOME || "");
        if (!fs.existsSync(resolvedPath)) {
          return "SSH key not found at the specified path.";
        }
      }
      return undefined;
    },
  });
}

/** Prompts for a value that must not be blank. Shared by every flow that falls back to a prompt when a required flag wasn't supplied. */
export async function askRequiredText(message: string, initialValue = ""): Promise<string> {
  return ask(text, {
    message,
    initialValue,
    validate: (value: string | undefined) => (value?.trim() ? undefined : "A value is required."),
  });
}
