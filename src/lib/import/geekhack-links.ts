const GB_PREFERRED_STATUSES = new Set([
  "GROUP_BUY",
  "PRODUCTION",
  "SHIPPING",
  "EXTRAS",
  "IN_STOCK",
  "COMPLETED",
  "ARCHIVED",
]);

export interface GeekhackLinkCandidate {
  url: string;
  label?: string | null;
}

export function extractGeekhackTopicIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!/geekhack\.org$/i.test(parsed.hostname)) return null;
    return parsed.searchParams.get("topic")?.match(/^(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normalizeGeekhackUrl(topicId: string): string {
  return `https://geekhack.org/index.php?topic=${topicId}.0`;
}

export function inferGeekhackLinkLabel(projectStatus: string): string {
  return projectStatus === "INTEREST_CHECK" ? "Geekhack IC" : "Geekhack GB";
}

function classifyGeekhackLink(link: GeekhackLinkCandidate): "IC" | "GB" | null {
  const label = link.label?.toLowerCase() ?? "";
  if (label.includes("geekhack gb")) return "GB";
  if (label.includes("geekhack ic")) return "IC";
  return null;
}

export function selectCanonicalGeekhackLink(
  projectStatus: string,
  links: GeekhackLinkCandidate[]
): GeekhackLinkCandidate | null {
  const deduped = new Map<string, GeekhackLinkCandidate>();

  for (const link of links) {
    const topicId = extractGeekhackTopicIdFromUrl(link.url);
    const key = topicId ?? link.url;
    if (!deduped.has(key)) deduped.set(key, link);
  }

  const preferredKind = GB_PREFERRED_STATUSES.has(projectStatus) ? "GB" : "IC";
  const ranked = [...deduped.values()].sort((a, b) => {
    const aKind = classifyGeekhackLink(a);
    const bKind = classifyGeekhackLink(b);

    const aPreferred = aKind === preferredKind ? 1 : 0;
    const bPreferred = bKind === preferredKind ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;

    const aTopicId = Number(extractGeekhackTopicIdFromUrl(a.url) ?? 0);
    const bTopicId = Number(extractGeekhackTopicIdFromUrl(b.url) ?? 0);
    if (aTopicId !== bTopicId) return bTopicId - aTopicId;

    return a.url.localeCompare(b.url);
  });

  return ranked[0] ?? null;
}
