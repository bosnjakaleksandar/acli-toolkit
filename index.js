#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { run } from "./src/cli/run.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
