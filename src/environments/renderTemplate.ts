import fs from "fs-extra";
import path from "node:path";

export async function readTemplate(templatesRoot: string, subdir: string, templateName: string): Promise<string> {
  return fs.readFile(path.join(templatesRoot, subdir, `${templateName}.yaml.tpl`), "utf-8");
}

/**
 * Replaces every `{{KEY}}` placeholder present in `replacements` with its
 * value. A key whose value is `undefined` is left untouched in the output —
 * lets a caller pass an always-present map (DB_IMAGE, WP_VERSION, ...) where
 * some placeholders are conditional on optional scaffold options, without
 * each call site re-deriving which replace() calls to skip.
 */
export function applyPlaceholders(content: string, replacements: Record<string, string | undefined>): string {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    if (value === undefined) continue;
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
