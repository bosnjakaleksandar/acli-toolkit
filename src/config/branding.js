import { getPackageMetadata } from "../utils/packageMetadata.js";

export const BRANDING = Object.freeze({
  name: "A-CLI",
  subtitle: "Developer Toolkit",
  command: "acli",
  cacheDirectory: ".a-cli",
});

export async function getBranding() {
  const { name: packageName, version } = await getPackageMetadata();
  return { ...BRANDING, packageName, version };
}
