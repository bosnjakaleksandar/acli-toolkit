export function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export function isValidPort(value: unknown): boolean {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 1 && numeric <= 65535;
}

// A project's name on a remote server. May contain spaces ("acme client
// site"); it is always shell-quoted before it reaches a remote command.
export const REMOTE_PROJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/** Whether a plan/options field is actually set (not undefined, null or an empty string). */
export function hasValue(object: Record<string, unknown>, key: string): boolean {
  return object[key] !== undefined && object[key] !== null && object[key] !== "";
}
