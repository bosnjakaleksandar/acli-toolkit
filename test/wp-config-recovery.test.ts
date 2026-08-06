import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { prepareWpConfigRecovery, restoreWpConfigAfterRecovery } from "../src/wordpress/migration/wpConfigRecovery.ts";

test("wp-config recovery preserves custom code while adopting regenerated DB constants", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-config-recovery-"));
  const configPath = path.join(directory, "wp-config.php");
  const original = `<?php
define('DB_NAME', 'old_db');
define('DB_USER', 'old_user');
define('DB_PASSWORD', 'old_password');
define('DB_HOST', 'old_host');
define('CUSTOM_SETTING', true);
require_once ABSPATH . 'wp-settings.php';
`;
  await fs.writeFile(configPath, original);
  const state = await prepareWpConfigRecovery(directory);
  await fs.writeFile(configPath, `<?php
define('DB_NAME', 'wordpress');
define('DB_USER', 'wordpress');
define('DB_PASSWORD', 'wordpress');
define('DB_HOST', 'db');
`);

  await restoreWpConfigAfterRecovery(state);
  const restored = await fs.readFile(configPath, "utf8");
  assert.match(restored, /define\('DB_NAME', 'wordpress'\)/);
  assert.match(restored, /define\('DB_HOST', 'db'\)/);
  assert.match(restored, /CUSTOM_SETTING/);
  assert.match(restored, /wp-settings\.php/);
  assert.equal(await fs.readFile(state.backupPath!, "utf8"), original);
  await fs.remove(directory);
});
