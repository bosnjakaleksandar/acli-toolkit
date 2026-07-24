import { spawn, type StdioOptions } from "node:child_process";

export function installLatestVersion(packageName: string, { stdio = "inherit" }: { stdio?: StdioOptions } = {}): Promise<void> {
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve, reject) => {
    const child = spawn(npmExecutable, ["install", "--global", `${packageName}@latest`], {
      shell: false,
      stdio,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed${signal ? ` (${signal})` : ` with exit code ${code}`}`));
    });
  });
}
