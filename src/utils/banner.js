import figlet from "figlet";
import gradient from "gradient-string";
import chalk from "chalk";
import { BRANDING, getBranding } from "../config/branding.js";
import { AcaCharacter, acaCharacter } from "../ui/acaCharacter.js";

const INDENT = "  ";
const LOGO_FONTS = ["ANSI Shadow", "Standard", "Small"];

export async function showBanner({ stdout = process.stdout, env = process.env, character } = {}) {
  const branding = await getBranding();
  const width = getTerminalWidth(stdout);
  const logo = renderLogo(width);
  const mascot = character ?? (stdout === process.stdout
    ? acaCharacter
    : new AcaCharacter({ stdout, env, manageProcess: false }));

  stdout.write(`\n${logo}\n\n`);
  stdout.write(`${INDENT}${chalk.dim(BRANDING.subtitle)}\n`);
  stdout.write(`${INDENT}${chalk.dim(`v${branding.version}`)}\n\n`);

  if (mascot.canAnimate()) await mascot.play("startup", "Activating digital core...");
  await mascot.play("idle", "Ready to build something awesome?");
  mascot.stop();
}

function renderLogo(width) {
  const available = width - INDENT.length;
  let asciiArt;
  for (const font of LOGO_FONTS) {
    asciiArt = figlet.textSync(BRANDING.name, { font }).trimEnd();
    if (widestLine(asciiArt) <= available) break;
  }
  const indented = asciiArt.split("\n").map((line) => `${INDENT}${line.trimEnd()}`).join("\n");
  return gradient(["#ffb800", "#ff6a00"]).multiline(indented);
}

function getTerminalWidth(stdout) {
  return Math.max(24, Math.min(stdout.columns || 80, 100));
}

function widestLine(block) {
  return Math.max(...block.split("\n").map((line) => line.length));
}
