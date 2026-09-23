import { select, log } from "@clack/prompts";
import { ask } from "../../ui/prompts.ts";
import type { SelectionMenu } from "./CoolifyProjectHost.ts";

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
