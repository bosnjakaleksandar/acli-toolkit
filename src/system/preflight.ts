import net from "node:net";
import { assertToolsAvailable } from "./toolCheck.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

export interface PreflightResult {
  warnings: string[];
}

/**
 * The local tools a create/import plan needs. Application projects are
 * generated through npm (create-vite, create-next-app) on this machine,
 * whatever environment they run in later; Docker/Lando is needed only when
 * one was chosen, and Composer/PHP when Laravel is.
 */
export function localRequirements(ctx: ProjectPlan): string[] {
  const required = ctx.appType === "application" ? ["npm"] : [];
  if (ctx.environment === "docker" || ctx.environment === "lando") required.push(ctx.environment);
  if (!ctx.skipGitInit) required.push("git");
  if (ctx.useLaravel) required.push("composer", "php");
  return required;
}

export async function runLocalPreflight(ctx: ProjectPlan & { port?: number }): Promise<PreflightResult> {
  assertToolsAvailable(localRequirements(ctx));
  const port = Number(ctx.port || (ctx.projectType === "react" ? 5173 : ctx.projectType === "nextjs" ? 3000 : 0));
  if (port && !(await isPortAvailable(port))) return { warnings: [`Port ${port} is already in use. The generated environment may require a different port.`] };
  return { warnings: [] };
}

export function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
