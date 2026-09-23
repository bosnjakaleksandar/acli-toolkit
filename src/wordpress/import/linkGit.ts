import { CliError } from "../../core/errors.ts";
import { applyGitSshHostAlias, linkGitRemote, type GitSetupResult } from "../../system/git.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../../system/safety.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { RemoteBackend } from "../../providers/registry.ts";
import type { ImportContext } from "./ImportContext.ts";

/**
 * Links the imported project to the Git origin the server reports, pull-only.
 * The origin URL comes from the server, so it is checked before it reaches
 * git; the profile's local SSH Host alias is applied to SSH URLs.
 */
export async function linkDiscoveredGit(
  remote: RemoteBackend,
  targetDir: string,
  ctx: ImportContext,
  { spinner = null, resumeCommand, gitLinker = linkGitRemote }: { spinner?: Spinner | null; resumeCommand?: string; gitLinker?: typeof linkGitRemote } = {},
): Promise<GitSetupResult | null> {
  const found = await remote.discoverGit();
  if (!found) return null;
  // found.url is the remote server's own report of its origin — untrusted
  // server-controlled data. Skip linking rather than write something unsafe
  // into the new project's git config or hand it to `git remote add`.
  if (!isSafeGitUrl(found.url)) {
    spinner?.message(`Skipping Git link: remote origin URL looked unsafe (${redactUrlCredentials(found.url)}).`);
    return null;
  }
  const localRemoteUrl = applyGitSshHostAlias(found.url, ctx.profile.git?.sshHostAlias);
  let result: GitSetupResult;
  try {
    result = await gitLinker(targetDir, localRemoteUrl, undefined, { previousRemoteUrl: found.url, ...(found.branch ? { branch: found.branch } : {}) });
  } catch (error: any) {
    const details = `${error?.stderr || ""}\n${error?.message || ""}`;
    if (/Permission denied \(publickey\)|Could not read from remote repository/i.test(details)) {
      const profileName = ctx.profile.profileName || "<profile>";
      const configuredAlias = ctx.profile.git?.sshHostAlias;
      const resume = resumeCommand || `acli import --resume --name ${ctx.projectName}`;
      throw new CliError("Git SSH authentication failed while fetching the discovered origin.", {
        code: "GIT_AUTH_FAILED",
        hint: configuredAlias
          ? `Verify the SSH alias with \`ssh -T git@${configuredAlias}\`, then resume with \`${resume}\`.`
          : `If ~/.ssh/config uses a Git account alias, run \`acli profile git-alias ${profileName} <alias>\`, then \`${resume}\`.`,
      });
    }
    throw error;
  }
  ctx.gitStatus = result.summary;
  return result;
}
