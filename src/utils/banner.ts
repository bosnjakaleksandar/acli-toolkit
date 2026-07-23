import figlet, { type FontName } from "figlet";
import gradient from "gradient-string";
import chalk from "chalk";
import { BRANDING, getBranding } from "../config/branding.ts";
import { AcaCharacter, mascot as defaultMascot } from "../ui/acaCharacter.ts";

const INDENT = "  ";
const LOGO_FONTS = ["ANSI Shadow", "Standard", "Small"];

export interface ShowBannerOptions {
  stdout?: NodeJS.WriteStream;
  env?: Record<string, string | undefined>;
  character?: AcaCharacter;
}

export async function showBanner({ stdout = process.stdout, env = process.env, character }: ShowBannerOptions = {}): Promise<void> {
  if (env.ACLI_QUIET === "1" || env.CI) return;
  const branding = await getBranding();
  const width = getTerminalWidth(stdout);
  const logo = renderLogo(width);
  const activeMascot = character ?? (stdout === process.stdout
    ? defaultMascot
    : new AcaCharacter({ stdout, env, manageProcess: false }));

  stdout.write(`\n${logo}\n\n`);
  stdout.write(`${INDENT}${chalk.dim(BRANDING.subtitle)}\n`);
  stdout.write(`${INDENT}${chalk.dim(`v${branding.version}`)}\n\n`);

  if (activeMascot.canAnimate()) await activeMascot.show("startup", "Activating digital core...");
  await activeMascot.show("idle", "Ready to build something awesome?");
  activeMascot.stop();
}

function renderLogo(width: number): string {
  const available = width - INDENT.length;
  let asciiArt = "";
  for (const font of LOGO_FONTS) {
    asciiArt = figlet.textSync(BRANDING.name, { font: font as FontName }).trimEnd();
    if (widestLine(asciiArt) <= available) break;
  }
  const indented = asciiArt.split("\n").map((line) => `${INDENT}${line.trimEnd()}`).join("\n");
  return gradient(["#ffb800", "#ff6a00"]).multiline(indented);
}

function getTerminalWidth(stdout: NodeJS.WriteStream): number {
  return Math.max(24, Math.min(stdout.columns || 80, 100));
}

function widestLine(block: string): number {
  return Math.max(...block.split("\n").map((line) => line.length));
}
