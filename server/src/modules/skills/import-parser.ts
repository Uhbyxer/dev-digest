import AdmZip from 'adm-zip';
import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * T5 — skill import parser. Pure functions: no HTTP, no DB. Parses a raw
 * markdown string, or an archive (zip) containing exactly one root-level
 * markdown file, into a preview payload for the T6 import routes.
 *
 * Frontmatter follows this repo's own `.claude/skills/<name>/SKILL.md` convention:
 * `---\nname: ...\ndescription: ...\n---\n<body>`. `type` is never present in
 * that convention — it always defaults to `custom`. Missing/malformed
 * frontmatter degrades to heuristics (never throws): filename → name, first
 * heading/paragraph → description.
 *
 * Security-critical: `parseArchiveSkill` NEVER opens, extracts, reads, or
 * executes any archive entry other than the single chosen root-level `.md`
 * file — this is a hard constraint (see CONTEXT.md "Import (skill)"), not an
 * implementation convenience. Only entry metadata (name, isDirectory) is read
 * for every other entry.
 */

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
}

export class ImportParseError extends Error {}

/**
 * Cap on the DECOMPRESSED size of the one markdown entry we read out of an
 * archive. The upload itself is size-capped at the HTTP boundary (2MB,
 * `import-routes.ts`), but that only bounds the compressed bytes — a small
 * zip can still declare (and, via DEFLATE, actually decompress to) a huge
 * uncompressed payload ("zip bomb"). A skill body is markdown text; there is
 * no legitimate reason for it to exceed a few hundred KB.
 */
const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024; // 5MB

/** Strip a matching pair of surrounding quotes (single or double) and trim. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  body: string;
}

/**
 * Parse YAML frontmatter (`name`/`description` keys only — `type` is never
 * read from frontmatter per convention) plus the body below the closing `---`.
 * Never throws: absent or malformed frontmatter simply yields an empty
 * frontmatter object and the whole input as the body.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { body: content };

  const [, yamlBlock, rest] = match;
  const data: Record<string, string> = {};
  for (const line of yamlBlock!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    data[key!] = unquote(rawValue!);
  }
  return { name: data.name, description: data.description, body: rest ?? '' };
}

/** filename (minus extension) → name heuristic. */
function nameFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  return base.replace(/\.md$/i, '');
}

/** first heading (`# ...`) or first non-empty paragraph → description heuristic. */
function descriptionFromBody(body: string): string {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*\S)\s*$/);
    if (heading) return heading[1]!;
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('#')) return trimmed;
  }
  return '';
}

/**
 * Parse a raw markdown string (a direct `.md` file upload). `source:
 * 'imported_url'` — chosen for a standalone local-file upload, distinct from
 * `'extracted'` (an archive-embedded file) and `'community'` (a future
 * shared-skill marketplace); see the T5 PR description for the reasoning.
 */
export function parseMarkdownSkill(filename: string, content: string): SkillImportPreview {
  const { name, description, body } = parseFrontmatter(content);
  return {
    name: name && name.length > 0 ? name : nameFromFilename(filename),
    description: description && description.length > 0 ? description : descriptionFromBody(body),
    type: 'custom',
    body,
    source: 'imported_url',
  };
}

/**
 * Parse an archive (zip) buffer, locating the single root-level `.md` file.
 * Throws `ImportParseError` when zero or more than one root-level `.md` entry
 * is found — never guesses. `source: 'extracted'` (the file came from inside
 * an archive, not a bare upload).
 */
export function parseArchiveSkill(buffer: Buffer): SkillImportPreview {
  const zip = new AdmZip(buffer);
  // Metadata only (entryName / isDirectory) — no entry content is read here.
  const rootMdEntries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.includes('/') && /\.md$/i.test(e.entryName));

  if (rootMdEntries.length === 0) {
    throw new ImportParseError('Archive contains no root-level markdown file');
  }
  if (rootMdEntries.length > 1) {
    throw new ImportParseError(
      `Archive contains ${rootMdEntries.length} root-level markdown files; expected exactly one`,
    );
  }

  // Reject an oversized DECLARED uncompressed size before ever decompressing
  // — the declared size comes from the zip's own (attacker-controlled)
  // central directory, so this is a cheap first check, not a full defense.
  const entry = rootMdEntries[0]!;
  if (entry.header.size > MAX_DECOMPRESSED_BYTES) {
    throw new ImportParseError('Archive entry is too large to be a skill file');
  }

  // Read ONLY the chosen entry's content — no other entry is ever opened.
  // Re-check the ACTUAL decompressed size: a crafted entry can under-report
  // its header while still inflating far past it (the real zip-bomb defense).
  const data = entry.getData();
  if (data.length > MAX_DECOMPRESSED_BYTES) {
    throw new ImportParseError('Archive entry is too large to be a skill file');
  }
  const content = data.toString('utf-8');
  const preview = parseMarkdownSkill(entry.entryName, content);
  return { ...preview, source: 'extracted' };
}
