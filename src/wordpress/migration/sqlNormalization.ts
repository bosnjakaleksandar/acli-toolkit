import fs from "fs-extra";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

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

/** Normalizes a dump through bounded-memory transforms and atomically swaps
 * the result into place. The buffer API remains for small/unit-test inputs. */
export async function normalizeSqlDumpFile(filePath: string, { spinner, normalizeCollations = true }: NormalizeSqlDumpOptions = {}): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.normalized.tmp`;
  const transforms: Transform[] = [];
  for (const step of NORMALIZATION_STEPS) {
    if (step.name === "normalize-collations" && !normalizeCollations) continue;
    spinner?.message(`Normalizing SQL: ${step.name}...`);
    if (step.name === "strip-create-database") transforms.push(new SqlStatementFilter());
    if (step.name === "strip-sandbox-marker") transforms.push(new BufferReplaceTransform(Buffer.from("/*M!999999\\- enable the sandbox mode */"), Buffer.alloc(0)));
    if (step.name === "normalize-collations") {
      for (const [from, to] of COLLATION_REPLACEMENTS) transforms.push(new BufferReplaceTransform(from, to));
    }
  }

  try {
    await pipeline(fs.createReadStream(filePath), ...transforms, fs.createWriteStream(temporaryPath, { mode: 0o600 }));
    await fs.move(temporaryPath, filePath, { overwrite: true });
    await fs.chmod(filePath, 0o600);
  } catch (error) {
    await fs.remove(temporaryPath).catch(() => {});
    throw error;
  }
}

class BufferReplaceTransform extends Transform {
  #search: Buffer;
  #replacement: Buffer;
  #carry = Buffer.alloc(0);

  constructor(search: Buffer, replacement: Buffer) {
    super();
    this.#search = search;
    this.#replacement = replacement;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const input = Buffer.concat([this.#carry, chunk]);
    const keep = Math.min(this.#search.length - 1, input.length);
    const boundary = input.length - keep;
    let offset = 0;
    let index: number;
    while ((index = input.indexOf(this.#search, offset)) !== -1 && index < boundary) {
      this.push(input.subarray(offset, index));
      this.push(this.#replacement);
      offset = index + this.#search.length;
    }
    const safeEnd = Math.max(offset, boundary);
    this.push(input.subarray(offset, safeEnd));
    this.#carry = input.subarray(safeEnd);
    callback();
  }

  override _flush(callback: (error?: Error | null) => void): void {
    this.push(replaceBuffer(this.#carry, this.#search, this.#replacement));
    callback();
  }
}

class SqlStatementFilter extends Transform {
  static readonly MAX_FILTERABLE_LINE = 64 * 1024;
  #line = Buffer.alloc(0);
  #passthroughLine = false;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.#passthroughLine) {
      const newline = chunk.indexOf(0x0a);
      if (newline === -1) {
        this.push(chunk);
        callback();
        return;
      }
      this.push(chunk.subarray(0, newline + 1));
      this.#passthroughLine = false;
      chunk = chunk.subarray(newline + 1);
    }
    let input = Buffer.concat([this.#line, chunk]);
    let newline: number;
    while ((newline = input.indexOf(0x0a)) !== -1) {
      this.#emitLine(input.subarray(0, newline + 1));
      input = input.subarray(newline + 1);
    }
    if (input.length > SqlStatementFilter.MAX_FILTERABLE_LINE) {
      this.push(input);
      this.#line = Buffer.alloc(0);
      this.#passthroughLine = true;
    } else {
      this.#line = input;
    }
    callback();
  }

  override _flush(callback: (error?: Error | null) => void): void {
    if (this.#line.length) this.#emitLine(this.#line);
    callback();
  }

  #emitLine(line: Buffer): void {
    const trimmed = line.toString("latin1").trim();
    if (/^CREATE DATABASE\b/i.test(trimmed) || /^USE\s+`[^`]+`\s*;?\s*$/i.test(trimmed)) return;
    this.push(line);
  }
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
