import { isObject } from "./schema.ts";

/**
 * Recursively merges `override` onto `base`, cloning every value so neither
 * input is aliased into the result. Used to layer configuration sources
 * (built-in defaults, user config, project config) and, in `acli create`, to
 * stack a plan's sources (defaults, history, preset, --set, CLI flags).
 */
export function deepMerge<T>(base: T, override: T): T {
  if (!isObject(base) || !isObject(override)) return structuredClone(override);
  const merged: Record<string, unknown> = structuredClone(base as Record<string, unknown>);
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    merged[key] = isObject(value) && isObject(merged[key]) ? deepMerge(merged[key], value) : structuredClone(value);
  }
  return merged as T;
}
