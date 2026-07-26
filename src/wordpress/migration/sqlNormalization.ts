// Ordered, named normalization steps applied to a remote WordPress SQL dump
// before it is imported locally. Keeping these as a documented list (rather
// than inline buffer edits) makes it possible to extend the pipeline without
// re-deriving what each step is for.
const COLLATION_REPLACEMENTS: Array<[Buffer, Buffer]> = [
  [Buffer.from("utf8mb3_uca1400_ai_ci"), Buffer.from("utf8_general_ci")],
  [Buffer.from("utf8mb4_uca1400_ai_ci"), Buffer.from("utf8mb4_unicode_520_ci")],
  [Buffer.from("utf8mb3_"), Buffer.from("utf8_")],
];

interface NormalizationStep {
  name: string;
  description: string;
  apply: (buffer: Buffer) => Buffer;
}

export const NORMALIZATION_STEPS: NormalizationStep[] = [
  {
    name: "strip-sandbox-marker",
    description: "Removes the MariaDB \"enable the sandbox mode\" marker some dump tools prepend, which is not valid SQL outside that specific server.",
    apply: (buffer) => replaceBuffer(buffer, Buffer.from("/*M!999999\\- enable the sandbox mode */"), Buffer.alloc(0)),
  },
  {
    name: "strip-create-database",
    description: "Removes CREATE DATABASE and USE statements so the dump always imports into the local environment's own database, regardless of what the remote database was named.",
    apply: (buffer) => stripCreateDatabaseStatements(buffer),
  },
  {
    name: "normalize-collations",
    description: "Rewrites collations the local MySQL/MariaDB image may not recognize (e.g. newer MariaDB uca1400 collations) to broadly compatible equivalents.",
    apply: (buffer) => COLLATION_REPLACEMENTS.reduce((acc, [from, to]) => replaceBuffer(acc, from, to), buffer),
  },
];

interface NormalizeSqlDumpOptions {
  spinner?: { message(text: string): void } | null;
  normalizeCollations?: boolean;
}

export function normalizeSqlDump(buffer: Buffer, { spinner, normalizeCollations = true }: NormalizeSqlDumpOptions = {}): Buffer {
  let result = buffer;
  for (const step of NORMALIZATION_STEPS) {
    if (step.name === "normalize-collations" && !normalizeCollations) continue;
    spinner?.message(`Normalizing SQL: ${step.name}...`);
    result = step.apply(result);
  }
  return result;
}

function stripCreateDatabaseStatements(buffer: Buffer): Buffer {
  // latin1 is a lossless byte<->codepoint round trip, so this stays
  // binary-safe even though the pass itself works line-by-line as text.
  const lines = buffer.toString("latin1").split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    return !/^CREATE DATABASE\b/i.test(trimmed) && !/^USE\s+`[^`]+`\s*;?\s*$/i.test(trimmed);
  });
  return Buffer.from(filtered.join("\n"), "latin1");
}

function replaceBuffer(buffer: Buffer, search: Buffer, replacement: Buffer): Buffer {
  if (search.length === 0) return buffer;
  const chunks: Buffer[] = [];
  let offset = 0;
  let index;
  while ((index = buffer.indexOf(search, offset)) !== -1) {
    chunks.push(buffer.subarray(offset, index), replacement);
    offset = index + search.length;
  }
  chunks.push(buffer.subarray(offset));
  return Buffer.concat(chunks);
}
