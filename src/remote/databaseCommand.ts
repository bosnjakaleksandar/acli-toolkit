import path from "node:path";
import { shellQuote } from "./sshArgs.ts";
import type { ResolvedProfile } from "../core/model/Profile.ts";

export interface RemoteCommand {
  /** The remote command string, passed as ssh's trailing positional argument. Never contains a secret value — see `stdin`. */
  command: string;
  /** When present, written to the ssh child process's stdin (then closed) before it runs — lets the remote script `read` a secret instead of it being embedded in `command`'s argv. */
  stdin?: string;
}

/**
 * Builds the remote database-export command for a profile's `database.driver`.
 * This is the single place a profile's loosely-typed `database` block is
 * interpreted per driver — see the `Profile["database"]` doc comment for why
 * it stays one object rather than a driver-keyed union.
 */
export function databaseCommand(profile: ResolvedProfile): RemoteCommand {
  const db = profile.database;
  const root = shellQuote(profile.remote.wordpressRoot);
  if (db.driver === "wp-cli") return { command: `cd ${root} && wp db export - --quiet` };
  if (db.driver === "docker") {
    if (db.discovery === "container-name") {
      const pattern = safeIdentifier(db.containerPattern || profile.projectName, "database.containerPattern");
      const executable = db.executable === "auto" ? "auto" : safeIdentifier(db.executable || "mariadb-dump", "database.executable");
      const envFile = safeRelativePath(db.envFile || ".env", "database.envFile");
      const userEnv = safeEnv(db.userEnv || "DB_USER");
      const passwordEnv = safeEnv(db.passwordEnv || "DB_PASSWORD");
      const nameEnv = safeEnv(db.nameEnv || "DB_NAME");
      const dump = executable === "auto" ? `DUMP=$(docker exec "$DBCONTAINER" sh -c 'command -v mariadb-dump || command -v mysqldump') && docker exec "$DBCONTAINER" "$DUMP"` : `docker exec "$DBCONTAINER" ${executable}`;
      return { command: `cd ${shellQuote(profile.remote.projectRoot)} && DBCONTAINER=$(docker ps --format '{{.Names}}' | grep -i ${shellQuote(pattern)} | grep -iE 'db|mariadb|mysql' | head -n 1) && test -n "$DBCONTAINER" && USER=$(grep -E ${shellQuote(`^(${userEnv}|MYSQL_USER)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && PASS=$(grep -E ${shellQuote(`^(${passwordEnv}|MYSQL_PASSWORD)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && NAME=$(grep -E ${shellQuote(`^(${nameEnv}|MYSQL_DATABASE)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && ${dump} -u"$USER" -p"$PASS" "$NAME"` };
    }
    const service = safeIdentifier(db.service || "db", "database.service");
    const compose = db.composeFile ? `-f ${shellQuote(path.posix.join(profile.remote.projectRoot, db.composeFile))}` : "";
    const executable = safeIdentifier(db.executable || "mariadb-dump", "database.executable");
    return { command: `cd ${shellQuote(profile.remote.projectRoot)} && docker compose ${compose} exec -T ${service} ${executable} -u"$${safeEnv(db.userEnv || "MYSQL_USER")}" -p"$${safeEnv(db.passwordEnv || "MYSQL_PASSWORD")}" "$${safeEnv(db.nameEnv || "MYSQL_DATABASE")}"` };
  }
  const executable = safeIdentifier(db.executable || "mysqldump", "database.executable");
  const host = shellQuote(db.host || "127.0.0.1");
  const port = Number(db.port || 3306);
  // The password travels over the ssh channel's stdin, read by this script's
  // `read -r` before the dump runs, rather than being embedded in this
  // command string — that string becomes ssh's own local argv (visible via
  // `ps`/`ps aux` on *this* machine for as long as the export runs) and, on
  // the remote side, the literal argument sshd hands to `sh -c` (visible to
  // any local user on the remote host the same way). MYSQL_PWD keeps the
  // password out of the mysqldump/mariadb-dump child's own argv too, same as
  // before — only now it's set from a variable populated via `read`, not a
  // literal baked into the script.
  const password = db.password || "";
  // `read -r` reads exactly one line, so a literal newline in the password
  // would silently truncate it instead of being delivered intact.
  if (password.includes("\n")) throw new Error("database.password cannot contain a newline: the direct driver delivers it as a single line over stdin.");
  const command = `IFS= read -r ACLI_DB_PASS && MYSQL_PWD="$ACLI_DB_PASS" ${executable} -h ${host} -P ${port} -u ${shellQuote(db.user || "")} ${shellQuote(db.name || "")}`;
  return { command, stdin: `${password}\n` };
}

function safeIdentifier(value: string, label: string): string { if (!/^[a-zA-Z0-9_.-]+$/.test(value)) throw new Error(`Unsafe ${label}.`); return value; }
function safeRelativePath(value: string, label: string): string { if (!/^[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..") || path.posix.isAbsolute(value)) throw new Error(`Unsafe ${label}.`); return value; }
function safeEnv(value: string): string { if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) throw new Error(`Unsafe environment variable name ${value}.`); return value; }
