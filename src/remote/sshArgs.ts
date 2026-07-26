import type { ResolvedProfile } from "../core/model/Profile.ts";

type Ssh = ResolvedProfile["ssh"];

/** Wraps a value for safe inclusion in a remote shell command string. */
export function shellQuote(value: unknown): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

/** Builds ssh's argv: connection options, `user@host`, and an optional trailing remote command. */
export function buildSshArgs(ssh: Ssh, remoteCommand?: string): string[] {
  const args = ["-p", String(ssh.port), ...connectionOptions(ssh)];
  args.push(`${ssh.username}@${ssh.host}`);
  if (remoteCommand) args.push(remoteCommand);
  return args;
}

/**
 * The same connection options as a single space-joined string, for rsync's
 * `-e` option — which accepts only a string, never an argv array, so there
 * is no array-based alternative to this construction. Safe because
 * ssh.host/username/identityFile are validated in resolveRemoteProfile (no
 * shell metacharacters, no leading "-").
 */
export function sshTransport(ssh: Ssh): string {
  return ["ssh", "-p", String(ssh.port), ...connectionOptions(ssh)].join(" ");
}

export function scpConnectionArgs(ssh: Ssh): string[] {
  return ["-P", String(ssh.port), ...(ssh.identityFile ? ["-i", ssh.identityFile] : [])];
}

// Shared by buildSshArgs and sshTransport so the identity-file and
// host-key-policy handling can never drift between the ssh and rsync paths.
function connectionOptions(ssh: Ssh): string[] {
  const options: string[] = [];
  if (ssh.identityFile) options.push("-i", ssh.identityFile, "-o", "IdentitiesOnly=yes");
  if (ssh.hostKeyPolicy === "accept-new") options.push("-o", "StrictHostKeyChecking=accept-new");
  if (ssh.hostKeyPolicy === "insecure") options.push("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null");
  return options;
}
