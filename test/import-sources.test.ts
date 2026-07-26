import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LocalFolderSource } from "../src/wordpress/import/sources/LocalFolderSource.ts";
import { SqlManualSource } from "../src/wordpress/import/sources/SqlManualSource.ts";
import { GitSource } from "../src/wordpress/import/sources/GitSource.ts";
import { ZipSource } from "../src/wordpress/import/sources/ZipSource.ts";
import { ImportSourceRegistry } from "../src/wordpress/import/ImportSource.ts";
import { CliError } from "../src/core/errors.ts";

async function tempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeFakeWpContent(root: string) {
  await fs.ensureDir(path.join(root, "wp-content", "themes", "sample"));
  await fs.writeFile(path.join(root, "wp-content", "themes", "sample", "style.css"), "/* sample theme */");
  await fs.ensureDir(path.join(root, "wp-content", "uploads"));
  await fs.writeFile(path.join(root, "wp-content", "uploads", "photo.jpg"), "fake-image-bytes");
}

test("ImportSourceRegistry registers and resolves sources by id, rejects duplicates and unknown ids", () => {
  const registry = new ImportSourceRegistry();
  registry.register(LocalFolderSource);
  assert.equal(registry.get("local"), LocalFolderSource);
  assert.throws(() => registry.register(LocalFolderSource), /already registered/);
  assert.throws(() => registry.get("nonexistent"), /Unknown import source/);
  assert.deepEqual(registry.list().map((s) => s.id), ["local"]);
});

test("LocalFolderSource copies wp-content from a local WordPress installation into targetDir", async () => {
  const source = await tempDir("acli-import-local-src-");
  const target = await tempDir("acli-import-local-target-");
  await makeFakeWpContent(source);

  await LocalFolderSource.fetchFiles({ targetDir: target, localPath: source });

  assert.ok(await fs.pathExists(path.join(target, "wp-content", "themes", "sample", "style.css")));
  assert.ok(await fs.pathExists(path.join(target, "wp-content", "uploads", "photo.jpg")));
  await fs.remove(source);
  await fs.remove(target);
});

test("LocalFolderSource throws a clear error when --local-path is missing or the path doesn't exist", async () => {
  const target = await tempDir("acli-import-local-target-");
  await assert.rejects(() => LocalFolderSource.fetchFiles({ targetDir: target }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "USAGE");
    return true;
  });
  await assert.rejects(() => LocalFolderSource.fetchFiles({ targetDir: target, localPath: "/definitely/not/a/real/path" }), /was not found/);
  await fs.remove(target);
});

test("SqlManualSource has a no-op fetchFiles and copies the given .sql file to staging.sql", async () => {
  const target = await tempDir("acli-import-sql-target-");
  const sqlFile = path.join(target, "..", `dump-${process.pid}.sql`);
  await fs.writeFile(sqlFile, "CREATE TABLE wp_options (id INT);");

  await SqlManualSource.fetchFiles({ targetDir: target });
  const result = await SqlManualSource.fetchDatabase({ targetDir: target, sqlFile });

  assert.deepEqual(result, { hasDump: true });
  assert.equal(await fs.readFile(path.join(target, "staging.sql"), "utf8"), "CREATE TABLE wp_options (id INT);");
  // A database dump may contain real user password hashes — regardless of
  // the source file's own permissions or the process umask, the copy this
  // tool makes should not be left world/group-readable.
  assert.equal((await fs.stat(path.join(target, "staging.sql"))).mode & 0o777, 0o600);
  await fs.remove(sqlFile);
  await fs.remove(target);
});

test("SqlManualSource.fetchDatabase throws when --sql-file is missing", async () => {
  const target = await tempDir("acli-import-sql-target-");
  await assert.rejects(() => SqlManualSource.fetchDatabase({ targetDir: target }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "USAGE");
    return true;
  });
  await fs.remove(target);
});

test("copySqlFile (shared by every source) throws a clear error when the given path doesn't exist", async () => {
  const target = await tempDir("acli-import-sql-target-");
  await assert.rejects(() => SqlManualSource.fetchDatabase({ targetDir: target, sqlFile: "/nope/missing.sql" }), /was not found/);
  await fs.remove(target);
});

test("GitSource clones a repository and copies its wp-content directory into targetDir", async () => {
  const repoDir = await tempDir("acli-import-git-repo-");
  await makeFakeWpContent(repoDir);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  execFileSync("git", ["add", "-A"], { cwd: repoDir });
  execFileSync("git", ["commit", "-q", "-m", "sample wp-content"], { cwd: repoDir });

  const target = await tempDir("acli-import-git-target-");
  await GitSource.fetchFiles({ targetDir: target, repositoryUrl: repoDir });

  assert.ok(await fs.pathExists(path.join(target, "wp-content", "themes", "sample", "style.css")));
  assert.equal(await fs.pathExists(path.join(target, ".git")), false, "the cloned repo's own .git history must not leak into the project");
  await fs.remove(repoDir);
  await fs.remove(target);
});

test("GitSource rejects a git ext::/leading-dash --repo value before ever invoking git", async () => {
  const target = await tempDir("acli-import-git-target-");
  await assert.rejects(
    () => GitSource.fetchFiles({ targetDir: target, repositoryUrl: 'ext::sh -c "id>/tmp/x"' }),
    (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "USAGE");
      return true;
    },
  );
  await assert.rejects(
    () => GitSource.fetchFiles({ targetDir: target, repositoryUrl: "--upload-pack=touch /tmp/pwned" }),
    (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "USAGE");
      return true;
    },
  );
  await fs.remove(target);
});

test("GitSource throws a clear, wrapped error when the clone fails", async () => {
  const target = await tempDir("acli-import-git-target-");
  await assert.rejects(
    () => GitSource.fetchFiles({ targetDir: target, repositoryUrl: "/definitely/not/a/git/repo" }),
    (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "GIT_CLONE_FAILED");
      return true;
    },
  );
  await fs.remove(target);
});

test("ZipSource extracts an archive and copies its wp-content directory into targetDir", async () => {
  const stageDir = await tempDir("acli-import-zip-stage-");
  await makeFakeWpContent(stageDir);
  const zipPath = path.join(os.tmpdir(), `acli-import-test-${process.pid}.zip`);
  await fs.remove(zipPath).catch(() => {});
  execFileSync("zip", ["-q", "-r", zipPath, "wp-content"], { cwd: stageDir });

  const target = await tempDir("acli-import-zip-target-");
  await ZipSource.fetchFiles({ targetDir: target, zipFile: zipPath });

  assert.ok(await fs.pathExists(path.join(target, "wp-content", "themes", "sample", "style.css")));
  assert.ok(await fs.pathExists(path.join(target, "wp-content", "uploads", "photo.jpg")));
  await fs.remove(stageDir);
  await fs.remove(zipPath);
  await fs.remove(target);
});

test("ZipSource refuses to extract a zip containing path-traversal entries, before ever running unzip's actual extraction", async () => {
  // `zip` stores whatever relative path it's given verbatim, including a
  // leading ../ — simulating a maliciously hand-crafted archive (a normal
  // `zip -r wp-content` from inside a WordPress export never produces one).
  const trickyDir = await tempDir("acli-import-zip-traversal-src-");
  await fs.ensureDir(path.join(trickyDir, "outer", "inner"));
  await fs.writeFile(path.join(trickyDir, "outer", "payload.txt"), "escaped");
  const zipPath = path.join(os.tmpdir(), `acli-import-traversal-${process.pid}.zip`);
  await fs.remove(zipPath).catch(() => {});
  execFileSync("zip", ["-q", zipPath, "../payload.txt"], { cwd: path.join(trickyDir, "outer", "inner") });
  assert.match(execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }), /\.\./);

  const target = await tempDir("acli-import-zip-traversal-target-");
  await assert.rejects(() => ZipSource.fetchFiles({ targetDir: target, zipFile: zipPath }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "ZIP_UNSAFE_ENTRIES");
    return true;
  });

  await fs.remove(trickyDir);
  await fs.remove(zipPath).catch(() => {});
  await fs.remove(target);
});

test("ZipSource throws a clear error when the zip file doesn't exist", async () => {
  const target = await tempDir("acli-import-zip-target-");
  await assert.rejects(() => ZipSource.fetchFiles({ targetDir: target, zipFile: "/nope/missing.zip" }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "ZIP_FILE_NOT_FOUND");
    return true;
  });
  await fs.remove(target);
});

test("copyWordPressContent (shared) throws a clear, actionable error when no wp-content directory is found anywhere in the source", async () => {
  const source = await tempDir("acli-import-empty-src-");
  await fs.writeFile(path.join(source, "readme.txt"), "not a wordpress export");
  const target = await tempDir("acli-import-empty-target-");

  await assert.rejects(() => LocalFolderSource.fetchFiles({ targetDir: target, localPath: source }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "WP_CONTENT_NOT_FOUND");
    return true;
  });
  await fs.remove(source);
  await fs.remove(target);
});
