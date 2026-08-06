import { execFileSync } from "node:child_process";

/**
 * Finds the first `{command: "..."}` secret reference or `${ENV_VAR}` string
 * anywhere within `value`, returning its dotted key path (or null if none is
 * found) — used to decide whether an auto-discovered project config needs to
 * be trusted before its secrets are resolved. Scans the *entire* document
 * (every root key, not just "profiles"/"project.profile"): resolveReferences
 * below walks the whole merged config, so anything it would resolve must be
 * covered here too, or a `${ENV_VAR}` reference tucked into e.g.
 * `defaults.themeRepo` would resolve — and then get embedded in a `git
 * clone` URL — without ever tripping the trust check.
 */
export function findSecretReferencePath(value: unknown, keyPath: string[] = []): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSecretReferencePath(value[index], [...keyPath, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command" && typeof entries[0]![1] === "string") return [...keyPath, "command"].join(".");
    for (const [key, item] of entries) {
      const found = findSecretReferencePath(item, [...keyPath, key]);
      if (found) return found;
    }
    return null;
  }
  return typeof value === "string" && /\$\{[A-Z_][A-Z0-9_]*\}/.test(value) ? keyPath.join(".") : null;
}

export function resolveReferences(value: unknown, { env = process.env, commandRunner = defaultSecretCommand }: { env?: Record<string, string | undefined>; commandRunner?: (command: string) => string } = {}): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, { env, commandRunner }));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command" && typeof entries[0]![1] === "string") return commandRunner(entries[0]![1] as string);
    return Object.fromEntries(entries.map(([key, item]) => [key, resolveReferences(item, { env, commandRunner })]));
  }
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    if (env[name] === undefined) throw new Error(`Required environment variable ${name} is not set.`);
    return env[name]!;
  });
}

function defaultSecretCommand(command: string): string {
  const [program, ...args] = splitCommand(command);
  if (!program) throw new Error("Secret command cannot be empty.");
  return execFileSync(program, args, { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, maxBuffer: 1024 * 1024 }).trim();
}

export function splitCommand(command: string): string[] {
  const result: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  for (const character of command) {
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (/\s/.test(character)) {
      if (token) { result.push(token); token = ""; }
      continue;
    }
    token += character;
  }
  if (quote) throw new Error("Secret command contains an unterminated quote.");
  if (token) result.push(token);
  return result;
}
