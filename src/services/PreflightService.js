import net from "node:net";
import { toolExists } from "./ToolCheckService.js";
import { CliError } from "../utils/CliError.js";

export async function runLocalPreflight(ctx) {
  // Application projects (React/Next.js/Laravel) are scaffolded by their
  // official generators and run via their own dev servers — Docker/Lando is
  // not required for them, but npm is (create-next-app/create-vite both run
  // through it).
  const required = ctx.appType === "application" ? ["npm"] : [ctx.environment];
  if (!ctx.skipGitInit && !ctx.skipGitLink) required.push("git");
  if (ctx.useLaravel) required.push("composer", "php");
  const missing = required.filter((command) => !toolExists(command));
  if (missing.length) throw new CliError(`Missing required tools: ${missing.join(", ")}.`, { code: "PREFLIGHT_FAILED", hint: `Run \`acli doctor --environment ${ctx.environment}\` for installation guidance.` });
  const port = Number(ctx.port || (ctx.projectType === "react" || ctx.projectType === "nextjs" ? 3000 : 0));
  if (port && !(await isPortAvailable(port))) return { warnings: [`Port ${port} is already in use. The generated environment may require a different port.`] };
  return { warnings: [] };
}

export function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
