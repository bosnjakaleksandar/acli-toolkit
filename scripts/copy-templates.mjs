import { copy } from "fs-extra";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const from = path.join(rootDir, "src", "templates");
const to = path.join(rootDir, "dist", "templates");

await copy(from, to);
