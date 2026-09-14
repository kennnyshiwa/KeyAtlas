/** Deliberately bounded legacy-link repair. Resolve by immutable identity, not
 * a second mutable slug. No schema migration or broad slug rewriting required.
 * Both names render the same record during repair/rollback; canonical metadata
 * follows the database slug. No cached reverse-redirect loops.
 * Check BOTH names for collisions, then deploy BEFORE the exact-record repair. */
export const HEARTBREAKER_SLUG_REPAIR = {
  id: "cmoum375i01l101phrdrudjk5",
  oldSlug: "notion-where-teams-and-agents-work-together",
  newSlug: "swg-heartbreaker-20-july-3-aug-2026",
  title: "SWG Heartbreaker | 20 July - 3 Aug 2026",
  status: "PRODUCTION",
} as const;

export function projectSlugCandidates(slug: string): string[] {
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch { /* Preserve malformed input. */ }
  return [...new Set([slug, decoded, decoded.normalize("NFC"), decoded.normalize("NFD")])];
}

export function getProjectSlugAliasId(slug: string): string | undefined {
  const candidates = projectSlugCandidates(slug);
  if ([HEARTBREAKER_SLUG_REPAIR.oldSlug, HEARTBREAKER_SLUG_REPAIR.newSlug].some((alias) => candidates.includes(alias))) {
    return HEARTBREAKER_SLUG_REPAIR.id;
  }
}

export function projectSlugWhere(slug: string) {
  const id = getProjectSlugAliasId(slug);
  return id ? { id } : { slug: { in: projectSlugCandidates(slug) } };
}

export function isReservedProjectSlug(slug: string, projectId?: string) {
  return (slug === HEARTBREAKER_SLUG_REPAIR.oldSlug || slug === HEARTBREAKER_SLUG_REPAIR.newSlug) && projectId !== HEARTBREAKER_SLUG_REPAIR.id;
}
