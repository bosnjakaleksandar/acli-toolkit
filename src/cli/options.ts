/**
 * Typed shapes for what commander hands each command's `.action()` callback.
 * Commander itself doesn't type these — every flag comes through as
 * `string | boolean | undefined` on a loosely-typed options bag — so these
 * interfaces describe the *registered* flags (see each command's own
 * `.option(...)` calls, which remain the source of truth) rather than being
 * derived from them mechanically. Where a single command file registers
 * several subcommands with overlapping-but-not-identical flag sets (config,
 * profile), one union interface with every field optional is used rather
 * than one interface per subcommand — matching how the handlers themselves
 * already read `options.field` without first checking which subcommand
 * they're in.
 */

/**
 * Union of flags across every `acli profile <subcommand>` — see
 * registerProfileCommand for which subcommand accepts which. Declared in
 * the profiles domain (the code that reads these fields) and re-exported
 * here under its CLI-facing name, so the dependency runs cli -> profiles
 * like every other command's.
 */
export type { ProfileBuilderOptions as ProfileCommandOptions } from "../profiles/ProfileBuilder.ts";

export interface CreateCommandOptions {
  name?: string;
  environment?: string;
  env?: string;
  preset?: string;
  profile?: string;
  config?: string;
  set?: string[];
  dryRun?: boolean;
  fromLast?: boolean;
  resume?: boolean;
  existing?: boolean;
  type?: string;
  framework?: string;
  laravel?: boolean;
  wpType?: string;
  mysql?: string;
  wpVersion?: string;
  themeRepo?: string;
  themeBranch?: string;
  stagingUrl?: string;
  sshKey?: string;
  keepDump?: boolean;
  skipFiles?: boolean;
  skipDatabase?: boolean;
  skipGitLink?: boolean;
  skipGit?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

/**
 * Union of every `acli import` flag. Declared in wordpress/import (each
 * source reads its own fields via `resolveOptions`) and re-exported here
 * under its CLI-facing name, so the dependency runs cli -> wordpress.
 */
export type { ImportOptions as ImportCommandOptions } from "../wordpress/import/ImportSource.ts";

/** Union of flags across every `acli config <subcommand>`. */
export interface ConfigCommandOptions {
  scope?: "project" | "user";
  config?: string;
  force?: boolean;
  resolved?: boolean;
}

export interface DoctorCommandOptions {
  preset?: string;
  profile?: string;
  config?: string;
  environment?: string;
  json?: boolean;
}

export interface LinkCommandOptions {
  name?: string;
  environment?: string;
  profile?: string;
  config?: string;
  force?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

export interface PullCommandOptions {
  config?: string;
  keepDump?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

/** Union of flags across `acli preset list` / `acli preset inspect <name>`. */
export interface PresetCommandOptions {
  config?: string;
  json?: boolean;
}
