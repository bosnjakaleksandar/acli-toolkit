/**
 * Validates a project name for filesystem and package compatibility.
 *
 * @param {string} value Candidate project name.
 * @returns {string | undefined}
 */
export function validateProjectName(value) {
  if (value.trim() === "") return "Project name cannot be empty.";
  if (!/^[a-z0-9-_]+$/.test(value)) {
    return "Project name can only contain lowercase letters, numbers, dashes, and underscores.";
  }
  return undefined;
}
