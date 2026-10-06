export function normalizeAgentName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
