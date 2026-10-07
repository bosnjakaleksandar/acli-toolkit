import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import { registerCreateCommand } from "../src/cli/commands/create.ts";
import { registerImportCommand } from "../src/cli/commands/import.ts";
import { MAIN_MENU } from "../src/cli/mainMenu.ts";
import { PROFILE_MENU_OPTIONS } from "../src/cli/commands/profile.ts";

function commandHelp(register: (program: Command) => void, name: string): string {
  const program = new Command();
  register(program);
  return program.commands.find((command) => command.name() === name)!.helpInformation();
}

test("the main menu keeps Create, Import and Profiles as separate first-class actions", () => {
  assert.deepEqual(MAIN_MENU.map(({ value }) => value), ["create", "import", "profiles", "link", "pull"]);
  assert.equal(MAIN_MENU[2]!.returnToMenu, true);
  assert.deepEqual(PROFILE_MENU_OPTIONS.map(({ value }) => value), ["create", "list", "use", "git-alias", "delete", "back"]);
});

test("create help contains only new-project controls", () => {
  const help = commandHelp(registerCreateCommand, "create");
  assert.doesNotMatch(help, /--existing/);
  assert.match(help, /--ssh-key/);
  for (const removed of ["--profile", "--staging-url", "--keep-dump", "--skip-files", "--skip-database", "--skip-git-link"]) {
    assert.doesNotMatch(help, new RegExp(removed));
  }
});

test("create still accepts the hidden --existing flag so old scripts get the acli import hint", () => {
  const program = new Command();
  registerCreateCommand(program);
  const create = program.commands.find((command) => command.name() === "create")!;
  const existing = create.options.find((option) => option.long === "--existing");
  assert.ok(existing, "--existing must stay registered");
  assert.equal(existing.hidden, true);
});

test("import help is profile-only and does not expose alternative source flags", () => {
  const help = commandHelp(registerImportCommand, "import");
  assert.match(help, /--profile/);
  for (const removed of ["--source", "--ssh-host", "--ssh-user", "--remote-path", "--db-driver", "--local-path", "--repo", "--branch", "--zip", "--sql-file"]) {
    assert.doesNotMatch(help, new RegExp(removed));
  }
});
