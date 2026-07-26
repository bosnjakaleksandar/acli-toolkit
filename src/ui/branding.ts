import { getPackageMetadata } from "../system/packageMetadata.ts";

export const BRANDING = Object.freeze({
  name: "A-CLI",
  subtitle: "Developer Toolkit",
  command: "acli",
});

export async function getBranding() {
  const { name: packageName, version } = await getPackageMetadata();
  return { ...BRANDING, packageName, version };
}
