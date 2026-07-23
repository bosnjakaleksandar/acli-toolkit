import { readFile } from "node:fs/promises";

let metadataPromise;

export function getPackageMetadata() {
  metadataPromise ??= readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse);
  return metadataPromise;
}
