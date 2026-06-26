import { text, select, confirm, isCancel, cancel } from "@clack/prompts";
import fs from "fs-extra";

export async function ask(promptFn, options) {
  const result = await promptFn(options);
  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }
  return result;
}

export async function askMysqlVersion() {
  return ask(select, {
    message: "Choose MySQL version:",
    options: [
      { label: "8.0 (Recommended)", value: "8.0" },
      { label: "5.7", value: "5.7" },
      { label: "MariaDB 11.4", value: "mariadb:11.4" },
    ],
  });
}

export async function askWpVersion() {
  return ask(text, {
    message: 'WordPress version (latest or specify version like "6.9.4"):',
    initialValue: "latest",
  });
}

export async function askSshKeyPath() {
  return ask(text, {
    message:
      "SSH Private Key Path (leave empty to use default system key, e.g., ~/.ssh/key_name):",
    initialValue: "",
    validate: (value) => {
      if (value) {
        const resolvedPath = value.replace(/^~/, process.env.HOME);
        if (!fs.existsSync(resolvedPath)) {
          return "SSH key not found at the specified path.";
        }
      }
    },
  });
}
