export const SAFE_TEMPLATE_VALUE = /^[a-zA-Z0-9._@:/~-]+$/;

/** Substitutes `{name}` placeholders in a profile field, rejecting unknown names and unsafe values. */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  if (typeof template !== "string") throw new Error("Profile path templates must be strings.");
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, name) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`Unknown profile template variable {${name}}.`);
    if (!SAFE_TEMPLATE_VALUE.test(String(value))) throw new Error(`Unsafe value for profile template variable {${name}}.`);
    return String(value);
  });
}
