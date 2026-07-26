/**
 * Validates a project name for filesystem and package compatibility.
 */
export function validateProjectName(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") return "Project name cannot be empty.";
  if (!/^[a-z0-9-_]+$/.test(value)) {
    return "Project name can only contain lowercase letters, numbers, dashes, and underscores.";
  }
  return undefined;
}
