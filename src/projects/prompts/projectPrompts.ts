import { confirm, select, text } from "@clack/prompts";
import { ask } from "../../ui/prompts.ts";
import { hasValue } from "../../core/objects.ts";
import {
  assertRequiredProjectContext,
  validateProjectContext,
} from "../plan/PlanBuilder.ts";
import { validateProjectName } from "../plan/projectName.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

/**
 * Collects project context using interactive prompts, skipping values already supplied (config defaults or CLI options).
 */
export async function collectProjectContext(known: ProjectPlan = {}, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<ProjectPlan> {
  validateProjectContext(known);
  if (nonInteractive) {
    assertRequiredProjectContext(known);
  }

  const setupType = "new";

  const projectName = hasValue(known, "projectName")
    ? known.projectName
    : await ask(text, {
        message: "What is the name of your project?",
        initialValue: "project-name",
        validate: validateProjectName,
      });

  let appType: ProjectPlan["appType"] = known.appType;
  let framework: ProjectPlan["framework"] = known.framework;
  let useLaravel = known.useLaravel ?? false;
  let wpType: ProjectPlan["wpType"] = known.wpType;
  let projectType: string | undefined = known.projectType;

  appType = hasValue(known, "appType")
    ? known.appType
    : ((await ask(select, {
        message: "Are you building an Application or a WordPress project?",
        options: [
          { label: "Application", value: "application" },
          { label: "WordPress", value: "wordpress" },
        ],
      })) as ProjectPlan["appType"]);

  if (appType === "application") {
    framework = hasValue(known, "framework")
      ? known.framework
      : ((await ask(select, {
          message: "Which frontend framework do you want to use?",
          options: [
            { label: "React", value: "react" },
            { label: "Next.js", value: "nextjs" },
          ],
        })) as ProjectPlan["framework"]);

    useLaravel = hasValue(known, "useLaravel")
      ? Boolean(known.useLaravel)
      : nonInteractive
        ? false
        : await ask(confirm, {
            message: "Do you want to add Laravel as a backend?",
            initialValue: false,
          });

    projectType = framework as string;
  } else {
    wpType = hasValue(known, "wpType")
      ? known.wpType
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

  // Application projects (React/Next.js/Laravel) are scaffolded by their
  // official generators and run via their own dev servers — Docker/Lando
  // no longer applies, so skip asking. The value is never read by those
  // strategies; it only still matters for WordPress projects.
  const environment = appType === "application"
    ? (known.environment ?? "docker")
    : hasValue(known, "environment")
      ? known.environment
      : await ask(select, {
          message: "Which local environment do you prefer?",
          options: [
            { label: "Docker (docker-compose.yaml)", value: "docker" },
            { label: "Lando (.lando.yml)", value: "lando" },
          ],
        });

  const customizeAdvanced = nonInteractive || hasValue(known, "customizeAdvanced")
    ? Boolean(known.customizeAdvanced)
    : await ask(confirm, { message: "Customize advanced settings (MySQL/WordPress versions)?", initialValue: false });

  const ctx: ProjectPlan = {
    ...known,
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
 * Pure transform applying a new-project type edit selection to the current
 * context. Kept separate from the prompt so the mapping is unit-testable
 * without mocking @clack/prompts.
 *
 * @param projectType Selected new-project type: react, nextjs, wp-theme, wp-woo, or wp-react.
 */
export function applyProjectTypeChange(ctx: ProjectPlan, projectType: string): ProjectPlan {
  // Legacy import fields never survive editing a new-project plan.
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
    initialValue: ctx.projectType,
    options: [
      { label: "React", value: "react" },
      { label: "Next.js", value: "nextjs" },
      { label: "WordPress theme", value: "wp-theme" },
      { label: "WordPress + WooCommerce", value: "wp-woo" },
      { label: "WordPress + React", value: "wp-react" },
    ],
  });
  return applyProjectTypeChange(ctx, projectType as string);
}
