import { ImportSourceRegistry } from "./ImportSource.ts";
import { LocalFolderSource } from "./sources/LocalFolderSource.ts";
import { GitSource } from "./sources/GitSource.ts";
import { SqlManualSource } from "./sources/SqlManualSource.ts";
import { ZipSource } from "./sources/ZipSource.ts";
import { createProfileImportSource } from "./sources/RemoteSource.ts";

/**
 * Every place an existing WordPress site can be imported from. Registration
 * order is the order the interactive "Where is the WordPress site coming
 * from?" menu lists them.
 */
export const importSourceRegistry = new ImportSourceRegistry();

importSourceRegistry.register(LocalFolderSource);
importSourceRegistry.register(GitSource);
importSourceRegistry.register(SqlManualSource);
importSourceRegistry.register(ZipSource);
// "profile" (a saved staging profile) and "ssh" (a one-off target with no
// saved profile) both describe *remote* WordPress hosts, so they share one
// RemoteHost-backed implementation — they differ only in how that source's
// own resolveOptions() obtains the profile.
importSourceRegistry.register(createProfileImportSource("profile", "Staging profile"));
importSourceRegistry.register(createProfileImportSource("ssh", "One-off SSH target"));
