import net from "node:net";
import { assertToolsAvailable } from "./toolCheck.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

export interface PreflightResult {
  warnings: string[];
}

export async function runLocalPreflight(ctx: ProjectPlan & { port?: number }): Promise<PreflightResult> {
  // Application projects (React/Next.js/Laravel) are scaffolded by their
  // official generators and run via their own dev servers — Docker/Lando is
  // not required for them, but npm is (create-next-app/create-vite both run
  // through it).
  const required = ctx.appType === "application" ? ["npm"] : [ctx.environment!];
  if (!ctx.skipGitInit) required.push("git");
  if (ctx.useLaravel) required.push("composer", "php");
  assertToolsAvailable(required);
  const port = Number(ctx.port || (ctx.projectType === "react" || ctx.projectType === "nextjs" ? 3000 : 0));
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
