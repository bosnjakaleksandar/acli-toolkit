import { confirm, select, text } from "@clack/prompts";
import { ask } from "../utils/prompts.js";
import { hasPresetValue } from "../services/PresetService.js";

/**
 * Collects project context using interactive prompts, skipping values supplied by a preset.
 *
 * @param {object} preset Loaded preset values.
 * @returns {Promise<object>}
 */
export async function collectProjectContext(preset = {}) {
  const setupType = hasPresetValue(preset, "setupType")
    ? preset.setupType
    : await ask(select, {
        message: "What would you like to do?",
        options: [
          { label: "Create a new project", value: "new" },
          { label: "Set up an existing WP project", value: "existing-wp" },
        ],
      });

  const projectName = hasPresetValue(preset, "projectName")
    ? preset.projectName
    : await ask(text, {
        message: "What is the name of your project?",
        initialValue: "project-name",
        validate: validateProjectName,
      });

  let appType = preset.appType ?? null;
  let framework = preset.framework ?? null;
  let useLaravel = preset.useLaravel ?? false;
  let wpType = preset.wpType ?? null;
  let projectType = preset.projectType ?? null;

  if (setupType === "new") {
    appType = hasPresetValue(preset, "appType")
      ? preset.appType
      : await ask(select, {
          message: "Are you building an Application or a WordPress project?",
          options: [
            { label: "Application", value: "application" },
            { label: "WordPress", value: "wordpress" },
          ],
        });

    if (appType === "application") {
      framework = hasPresetValue(preset, "framework")
        ? preset.framework
        : await ask(select, {
            message: "Which frontend framework do you want to use?",
            options: [
              { label: "React", value: "react" },
              { label: "Next.js", value: "nextjs" },
            ],
          });

      useLaravel = hasPresetValue(preset, "useLaravel")
        ? Boolean(preset.useLaravel)
        : await ask(confirm, {
            message: "Do you want to add Laravel as a backend?",
            initialValue: false,
          });

      projectType = framework;
    } else {
      wpType = hasPresetValue(preset, "wpType")
        ? preset.wpType
        : await ask(select, {
            message: "Which WordPress project setup do you need?",
            options: [
              { label: "Standard Theme", value: "wp-theme" },
              { label: "WordPress + WooCommerce", value: "wp-woo" },
              { label: "WordPress + React", value: "wp-react" },
            ],
          });

      projectType = wpType;
    }
  } else {
    appType = "wordpress";
    projectType = "wp-existing";
  }

  const environment = hasPresetValue(preset, "environment")
    ? preset.environment
    : await ask(select, {
        message: "Which local environment do you prefer?",
        options: [
          { label: "Docker (docker-compose.yaml)", value: "docker" },
          { label: "Lando (.lando.yml)", value: "lando" },
        ],
      });

  return {
    ...preset,
    setupType,
    projectName,
    projectType,
    appType,
    framework,
    useLaravel,
    wpType,
    environment,
  };
}

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
