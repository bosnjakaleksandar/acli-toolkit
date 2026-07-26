import { confirm, select, text } from "@clack/prompts";
import { ask } from "../../ui/prompts.ts";
import { hasPresetValue } from "../plan/presets.ts";
import {
  assertRequiredProjectContext,
  validateProjectContext,
} from "../plan/PlanBuilder.ts";
import { validateProjectName } from "../plan/projectName.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

/**
 * Collects project context using interactive prompts, skipping values supplied by a preset.
 */
export async function collectProjectContext(preset: ProjectPlan = {}, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<ProjectPlan> {
  validateProjectContext(preset);
  if (nonInteractive) {
    assertRequiredProjectContext(preset);
  }

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

  let appType: ProjectPlan["appType"] = preset.appType;
  let framework: ProjectPlan["framework"] = preset.framework;
  let useLaravel = preset.useLaravel ?? false;
  let wpType: ProjectPlan["wpType"] = preset.wpType;
  let projectType: string | undefined = preset.projectType;

  if (setupType === "new") {
    appType = hasPresetValue(preset, "appType")
      ? preset.appType
      : ((await ask(select, {
          message: "Are you building an Application or a WordPress project?",
          options: [
            { label: "Application", value: "application" },
            { label: "WordPress", value: "wordpress" },
          ],
        })) as ProjectPlan["appType"]);

    if (appType === "application") {
      framework = hasPresetValue(preset, "framework")
        ? preset.framework
        : ((await ask(select, {
            message: "Which frontend framework do you want to use?",
            options: [
              { label: "React", value: "react" },
              { label: "Next.js", value: "nextjs" },
            ],
          })) as ProjectPlan["framework"]);

      useLaravel = hasPresetValue(preset, "useLaravel")
        ? Boolean(preset.useLaravel)
        : nonInteractive
          ? false
          : await ask(confirm, {
              message: "Do you want to add Laravel as a backend?",
              initialValue: false,
            });

      projectType = framework as string;
    } else {
      wpType = hasPresetValue(preset, "wpType")
        ? preset.wpType
        : ((await ask(select, {
            message: "Which WordPress project setup do you need?",
            options: [
              { label: "Standard Theme", value: "wp-theme" },
              { label: "WordPress + WooCommerce", value: "wp-woo" },
              { label: "WordPress + React", value: "wp-react" },
            ],
          })) as ProjectPlan["wpType"]);

      projectType = wpType as string;
    }
  } else {
    appType = "wordpress";
    projectType = "wp-existing";
  }

  // Application projects (React/Next.js/Laravel) are scaffolded by their
  // official generators and run via their own dev servers — Docker/Lando
  // no longer applies, so skip asking. The value is never read by those
  // strategies; it only still matters for WordPress projects.
  const environment = appType === "application"
    ? (preset.environment ?? "docker")
    : hasPresetValue(preset, "environment")
      ? preset.environment
      : await ask(select, {
          message: "Which local environment do you prefer?",
          options: [
            { label: "Docker (docker-compose.yaml)", value: "docker" },
            { label: "Lando (.lando.yml)", value: "lando" },
          ],
        });

  const customizeAdvanced = nonInteractive || hasPresetValue(preset, "customizeAdvanced")
    ? Boolean(preset.customizeAdvanced)
    : await ask(confirm, { message: "Customize advanced settings (MySQL/WordPress versions)?", initialValue: false });

  const ctx: ProjectPlan = {
    ...preset,
    setupType: setupType as ProjectPlan["setupType"],
    projectName,
    projectType,
    appType: appType as ProjectPlan["appType"],
    framework: framework as ProjectPlan["framework"],
    useLaravel,
    wpType: wpType as ProjectPlan["wpType"],
    environment: environment as ProjectPlan["environment"],
    customizeAdvanced,
  };

  return validateProjectContext(ctx);
}

export { validateProjectName };

/**
 * Pure transform applying a "Project type" edit selection to the current
 * context. Kept separate from the prompt so the mapping (including which
 * fields survive a switch to/from existing-wp) is unit-testable without
 * mocking @clack/prompts.
 *
 * @param projectType Selected type: react, nextjs, wp-theme, wp-woo, wp-react, or existing-wp.
 */
export function applyProjectTypeChange(ctx: ProjectPlan, projectType: string): ProjectPlan {
  if (projectType === "existing-wp") {
    // Preserve any profile/stagingUrl already attached (e.g. the context was
    // already existing-wp and the user is just re-confirming the type), so
    // reopening this menu never silently detaches a linked profile.
    return { ...ctx, setupType: "existing-wp", appType: "wordpress", projectType: "wp-existing", framework: null, useLaravel: false, wpType: null };
  }
  // Switching to a new-project type: a profile/stagingUrl from a prior
  // existing-wp selection no longer applies to a freshly scaffolded project,
  // so drop them explicitly instead of letting them ride along unused.
  const cleared = { ...ctx, profile: undefined, stagingUrl: undefined };
  if (projectType === "react" || projectType === "nextjs") return { ...cleared, setupType: "new", appType: "application", framework: projectType as ProjectPlan["framework"], projectType, wpType: null };
  return { ...cleared, setupType: "new", appType: "wordpress", framework: null, useLaravel: false, projectType, wpType: projectType as ProjectPlan["wpType"] };
}

export async function editProjectContext(ctx: ProjectPlan): Promise<ProjectPlan> {
  const section = await ask(select, {
    message: "What do you want to change?",
    options: [
      { label: "Project name", value: "name" },
      { label: "Project type", value: "type" },
      { label: "Local environment", value: "environment" },
      { label: "Git initialization", value: "git" },
      { label: "Back to plan", value: "done" },
    ],
  });
  if (section === "done") return ctx;
  if (section === "name") return { ...ctx, projectName: await ask(text, { message: "Project name:", initialValue: ctx.projectName, validate: validateProjectName }) };
  if (section === "environment") return { ...ctx, environment: await ask(select, { message: "Local environment:", options: [{ label: "Docker Compose", value: "docker" }, { label: "Lando", value: "lando" }], initialValue: ctx.environment }) as ProjectPlan["environment"] };
  if (section === "git") return { ...ctx, skipGitInit: !(await ask(confirm, { message: "Initialize a Git repository?", initialValue: !ctx.skipGitInit })) };
  const projectType = await ask(select, {
    message: "Project type:",
    initialValue: ctx.setupType === "existing-wp" ? "existing-wp" : ctx.projectType,
    options: [
      { label: "React", value: "react" },
      { label: "Next.js", value: "nextjs" },
      { label: "WordPress theme", value: "wp-theme" },
      { label: "WordPress + WooCommerce", value: "wp-woo" },
      { label: "WordPress + React", value: "wp-react" },
      { label: "Existing WordPress project", value: "existing-wp" },
    ],
  });
  return applyProjectTypeChange(ctx, projectType as string);
}
