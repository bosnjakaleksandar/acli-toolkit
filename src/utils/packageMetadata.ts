import { readFile } from "node:fs/promises";

export interface PackageMetadata {
  name: string;
  version: string;
  [key: string]: unknown;
}

let metadataPromise: Promise<PackageMetadata> | undefined;

export function getPackageMetadata(): Promise<PackageMetadata> {
  metadataPromise ??= readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse);
  return metadataPromise;
}
