import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import figlet from "figlet";
import { showBanner } from "../src/ui/banner.ts";
import { BRANDING } from "../src/ui/branding.ts";
import { getPackageMetadata } from "../src/system/packageMetadata.ts";

function createOutput({ isTTY = false, columns = 80 } = {}) {
  let contents = "";
  return {
    isTTY,
    columns,
    write(chunk) {
      contents += chunk;
      return true;
    },
    read() {
      return stripVTControlCharacters(contents);
    },
    raw() {
      return contents;
    },
  };
}

test("banner renders the A-CLI identity, subtitle, greeting, and package version", async () => {
  const stdout = createOutput();
  const { version } = await getPackageMetadata();
  await showBanner({ stdout, env: {} });

  const output = stdout.read();
  const logoFirstLine = figlet.textSync(BRANDING.name, { font: "ANSI Shadow" }).trim().split("\n")[0].trim();
  assert.match(output, new RegExp(logoFirstLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /Developer Toolkit/);
  assert.match(output, new RegExp(`v${version.replaceAll(".", "\\.")}`));
  assert.match(output, /A-CLI Bot/);
  assert.match(output, /Ready to build something awesome\?/);
});

test("banner layout is left-aligned with the mascot beside its text", async () => {
  const stdout = createOutput();
  await showBanner({ stdout, env: {} });

  const output = stdout.read();
  assert.match(output, /\n {2}Developer Toolkit/);
  assert.match(output, /\n {2}v\d+\.\d+\.\d+/);
  assert.match(output, /│ {9}A-CLI Bot/);
  assert.match(output, /│ {9}Ready to build something awesome\?/);
  assert.doesNotMatch(output, /\n {10,}Developer Toolkit/);
});

test("non-TTY output uses a complete static banner without animation controls", async () => {
  const stdout = createOutput({ isTTY: false });
  await showBanner({ stdout, env: {} });

  assert.doesNotMatch(stdout.raw(), /\x1B\[\d+A/);
  assert.equal((stdout.read().match(/Ready to build something awesome\?/g) ?? []).length, 1);
});

test("reduced motion disables animation even for a TTY", async () => {
  const stdout = createOutput({ isTTY: true });
  await showBanner({ stdout, env: { A_CLI_REDUCED_MOTION: "1" } });

  assert.doesNotMatch(stdout.raw(), /\x1B\[\?25l/);
  const { version } = await getPackageMetadata();
  assert.match(stdout.read(), new RegExp(`Developer Toolkit[\\s\\S]*v${version.replaceAll(".", "\\.")}[\\s\\S]*A-CLI Bot`));
});
