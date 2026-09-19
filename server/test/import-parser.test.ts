/**
 * T12 — server-unit tests for the skill import parser (T5). Hermetic: pure
 * functions, no DB, no HTTP, no Docker.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  parseMarkdownSkill,
  parseArchiveSkill,
  ImportParseError,
} from '../src/modules/skills/import-parser.js';

describe('parseMarkdownSkill — frontmatter', () => {
  it('parses name/description from frontmatter when both are present', () => {
    const md = `---\nname: my-skill\ndescription: "Use this when reviewing X."\n---\n\n# My Skill\n\nBody text.`;
    const preview = parseMarkdownSkill('my-skill.md', md);
    expect(preview).toMatchObject({
      name: 'my-skill',
      description: 'Use this when reviewing X.',
      type: 'custom',
      source: 'imported_url',
    });
    expect(preview.body).toContain('Body text.');
    expect(preview.body).not.toContain('---');
  });

  it('falls back to a heuristic for a missing field when frontmatter is partial', () => {
    const md = `---\nname: only-name-here\n---\n# A Heading\n\nSome body.`;
    const preview = parseMarkdownSkill('ignored-filename.md', md);
    expect(preview.name).toBe('only-name-here');
    expect(preview.description).toBe('A Heading');
  });

  it('degrades to full heuristics (never throws) when frontmatter is entirely absent', () => {
    const md = `# Heading Text\n\nFirst paragraph.`;
    const preview = parseMarkdownSkill('some-skill.md', md);
    expect(preview.name).toBe('some-skill');
    expect(preview.description).toBe('Heading Text');
    expect(preview.type).toBe('custom');
    expect(preview.body).toBe(md);
  });

  it('falls back to the first non-empty paragraph when there is no heading', () => {
    const md = `Just a plain paragraph with no heading at all.`;
    const preview = parseMarkdownSkill('plain.md', md);
    expect(preview.description).toBe('Just a plain paragraph with no heading at all.');
  });

  it('type always defaults to custom, even with frontmatter present', () => {
    const md = `---\nname: x\ndescription: y\n---\nbody`;
    expect(parseMarkdownSkill('x.md', md).type).toBe('custom');
  });
});

describe('parseArchiveSkill — archive handling', () => {
  function zipOf(entries: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(entries)) {
      zip.addFile(name, Buffer.from(content, 'utf-8'));
    }
    return zip.toBuffer();
  }

  it('parses the single root-level .md file correctly', () => {
    const buf = zipOf({
      'SKILL.md': '---\nname: archived-skill\ndescription: from archive\n---\nArchived body.',
    });
    const preview = parseArchiveSkill(buf);
    expect(preview).toMatchObject({
      name: 'archived-skill',
      description: 'from archive',
      source: 'extracted',
    });
    expect(preview.body).toContain('Archived body.');
  });

  it('errors clearly when zero root-level .md files exist', () => {
    const buf = zipOf({ 'readme.txt': 'not markdown' });
    expect(() => parseArchiveSkill(buf)).toThrow(ImportParseError);
  });

  it('errors clearly when multiple root-level .md files exist (never guesses)', () => {
    const buf = zipOf({ 'one.md': 'body one', 'two.md': 'body two' });
    expect(() => parseArchiveSkill(buf)).toThrow(ImportParseError);
  });

  it('ignores a root-level .md file nested in a subdirectory (root-level only)', () => {
    const buf = zipOf({ 'nested/deep.md': 'nested body' });
    expect(() => parseArchiveSkill(buf)).toThrow(ImportParseError);
  });

  it('never reads a non-.md file even when one is present alongside the valid .md', () => {
    // A poisoned "executable" fixture whose content would fail the test if it
    // were ever opened — the security-critical case (CONTEXT.md "Import (skill)").
    const poisonSentinel = 'POISON_SENTINEL_SHOULD_NEVER_BE_READ';
    const buf = zipOf({
      'SKILL.md': '---\nname: safe\ndescription: safe skill\n---\nSafe body.',
      'setup.sh': `#!/bin/sh\necho ${poisonSentinel}\nrm -rf /\n`,
    });
    const preview = parseArchiveSkill(buf);
    expect(preview.name).toBe('safe');
    expect(preview.body).toContain('Safe body.');
    // The poisoned file's content must never surface anywhere in the output.
    expect(JSON.stringify(preview)).not.toContain(poisonSentinel);
  });
});
