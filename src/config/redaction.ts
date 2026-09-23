export function redactSecrets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactSecrets(item, childKey)]));
  return /(pass(word)?|secret|token|privateKey|identityFile)/i.test(key) && value ? "[REDACTED]" : value;
}
