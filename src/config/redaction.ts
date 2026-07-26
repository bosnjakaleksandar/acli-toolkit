export function redactSecrets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactSecrets(item, childKey)]));
  // Fields ending in "Env" (userEnv, passwordEnv, nameEnv, ...) hold the
  // NAME of an environment variable to look up remotely, never a secret
  // value themselves — redacting them (the substring "password" matches
  // "passwordEnv") would hide harmless, useful config for no security benefit.
  const isEnvNameReference = /Env$/.test(key);
  return !isEnvNameReference && /(pass(word)?|secret|token|privateKey|identityFile)/i.test(key) && value ? "[REDACTED]" : value;
}

/**
 * Finds sensitive-looking fields (same key heuristic as redactSecrets) that
 * hold a literal value rather than a `${ENV_VAR}`/`{command: ...}` reference —
 * e.g. a hardcoded local `identityFile` path. Used to warn before a profile
 * is exported for sharing, where a value that's fine for solo use (a path
 * only meaningful on the exporter's own machine) would silently break for
 * whoever imports it.
 */
export function findLiteralSecretFields(value: unknown, keyPath: string[] = [], parentKey = "", out: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((item, index) => findLiteralSecretFields(item, [...keyPath, String(index)], parentKey, out)); return out; }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command") return out; // a secret-command reference, not a literal
    for (const [childKey, item] of entries) findLiteralSecretFields(item, [...keyPath, childKey], childKey, out);
    return out;
  }
  const isEnvNameReference = /Env$/.test(parentKey);
  const isSensitiveKey = !isEnvNameReference && /(pass(word)?|secret|token|privateKey|identityFile)/i.test(parentKey);
  if (isSensitiveKey && typeof value === "string" && value && !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value)) out.push(keyPath.join("."));
  return out;
}
