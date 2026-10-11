/**
 * Filesystem-safe slugs derived from names (AC-6, Q6: no persisted slug column).
 * Pure functions only.
 */

/** Lowercase, `[a-z0-9-]` only, no leading/trailing/repeated dashes. */
export function slugify(name: string, fallback = 'item'): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : fallback;
}

export interface Sluggable {
  id: string;
  name: string;
  createdAt: Date;
}

/**
 * Assign a unique slug to every item. Items are ordered by `createdAt` (then
 * `id`) so the assignment is deterministic and stable across re-exports; the
 * first item keeps the plain slug, later collisions get `-2`, `-3`, ….
 */
export function assignSlugs(items: Sluggable[], fallback = 'item'): Map<string, string> {
  const sorted = [...items].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const item of sorted) {
    const base = slugify(item.name, fallback);
    let candidate = base;
    for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
    used.add(candidate);
    out.set(item.id, candidate);
  }
  return out;
}
