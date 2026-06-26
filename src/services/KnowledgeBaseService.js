import { text, select, confirm, spinner } from "@clack/prompts";
import chalk from "chalk";
import { createProjectPost } from "../utils/wpApi.js";
import { ask } from "../utils/prompts.js";
import { runCommandSync } from "../utils/commandRunner.js";

export async function registerOnKnowledgeBase(ctx) {
  const sendToWp = await ask(confirm, {
    message:
      "Do you want to register this project on the Knowledge Base (Baza Znanja)?",
    initialValue: true,
  });

  if (!sendToWp) return;

  const repoUrl = await ask(text, {
    message: "What is the Github Repository URL (SSH or HTTP)?",
    initialValue: ctx.stagingRepoUrl || "",
  });

  const stagingUrl = await ask(text, {
    message: "What is the Staging URL?",
    initialValue: `https://${ctx.projectName}${process.env.STAGING_SUFFIX || ".staging"}`,
  });

  let defaultDevName = "Unknown Developer";
  try {
    defaultDevName = runCommandSync("git", ["config", "user.name"]).stdout.trim();
  } catch {
    // Keep the fallback when Git is unavailable or user.name is not configured.
  }

  const developerName = await ask(text, {
    message: "Developer Name:",
    initialValue: defaultDevName,
  });

  const envChoice = await ask(select, {
    message: "Where is the Knowledge Base running?",
    options: [
      {
        label: `Staging (${process.env.KNOWLEDGE_BASE_URL || "https://knowledge-base.staging"})`,
        value:
          process.env.KNOWLEDGE_BASE_URL || "https://knowledge-base.staging",
      },
      { label: "Custom URL", value: "custom" },
    ],
  });

  let wpSiteUrl = envChoice;
  if (envChoice === "custom") {
    wpSiteUrl = await ask(text, {
      message: "Enter the Base URL of the Knowledge Base:",
    });
  }

  let basicAuthUser = process.env.WP_BASIC_AUTH_USER || "";
  let basicAuthPass = process.env.WP_BASIC_AUTH_PASS || "";

  const spinnerWp = spinner();
  spinnerWp.start("Registering project on Knowledge Base...");
  try {
    const post = await createProjectPost({
      wpSiteUrl,
      developerName,
      projectName: ctx.projectName,
      repoUrl,
      stagingUrl,
      basicAuthUser,
      basicAuthPass,
    });
    spinnerWp.stop(chalk.green(`Project registered! Post ID: ${post.id}`));
  } catch (err) {
    spinnerWp.stop(chalk.red("Failed to register project on Knowledge Base."));
    console.log(chalk.red(`│  ${err.message}`));
  }
}
