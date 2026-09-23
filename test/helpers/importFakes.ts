import fs from "fs-extra";
import path from "node:path";
import type { RemoteBackend } from "../../src/providers/registry.ts";
import type { ImportContext } from "../../src/wordpress/import/ImportContext.ts";

/**
 * A provider backend that records which operations ran. exportDatabase
 * writes `dump` as staging.sql (nothing when it is null), and
 * discoverGit reports no origin unless overridden.
 */
export function fakeRemote({ dump = null, calls = [], overrides = {} }: { dump?: string | null; calls?: string[]; overrides?: Partial<RemoteBackend> } = {}): RemoteBackend {
  return {
    requiredTools: () => ["ssh"],
    fileTargets: () => ["uploads"],
    async preflight() { calls.push("preflight"); },
    async syncFiles() { calls.push("fetchFiles"); },
    async exportDatabase(targetDir: string) {
      calls.push("fetchDatabase");
      if (dump !== null) await fs.writeFile(path.join(targetDir, "staging.sql"), dump);
    },
    async getRemoteFacts() { return { tablePrefix: null, siteUrl: null }; },
    async discoverGit() { calls.push("linkGit"); return null; },
    ...overrides,
  };
}

/** A complete import context for an ssh profile, as the import command builds it. */
export function importCtx(targetDir: string, overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    targetDir,
    projectName: "client-site",
    environment: "docker",
    appType: "wordpress",
    setupType: "existing-wp",
    projectType: "wp-existing",
    mysqlVersion: "8.0",
    wpVersion: "6.8",
    profile: {
      __resolved: true,
      profileName: "shared-host",
      projectName: "client-site",
      provider: "ssh",
      ssh: { host: "staging.example.com", port: 22, username: "deploy", identityFile: "", hostKeyPolicy: "strict" },
      remote: { projectRoot: "/srv/client-site", wordpressRoot: "/srv/client-site/wordpress" },
      database: {},
    },
    ...overrides,
  };
}
