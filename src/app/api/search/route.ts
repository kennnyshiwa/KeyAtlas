import { NextRequest, NextResponse } from "next/server";
import { searchProjects, searchDesigners, searchVendors } from "@/lib/meilisearch";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitleMatch(title: string, query: string) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedTitle || !normalizedQuery) return 0;

  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 1000;
  if (normalizedTitle.startsWith(normalizedQuery)) score += 400;
  if (normalizedTitle.includes(normalizedQuery)) score += 250;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleTokens = new Set(normalizedTitle.split(" ").filter(Boolean));
  const matchedTokens = queryTokens.filter((token) => titleTokens.has(token)).length;

  score += matchedTokens * 40;
  if (matchedTokens === queryTokens.length) score += 200;

  return score;
}

function getProjectTitle(hit: unknown) {
  const title = (hit as { title?: unknown } | null)?.title;
  return typeof title === "string" ? title : "";
}

function rerankProjectHits<T>(hits: T[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return hits;

  return hits
    .map((hit, index) => ({
      hit,
      index,
      score: scoreTitleMatch(getProjectTitle(hit), normalizedQuery),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(({ hit }) => hit);
}

async function filterToLiveProjectHits<T>(hits: T[]): Promise<T[]> {
  if (hits.length === 0) return hits;

  const getId = (hit: T) => {
    const id = (hit as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  };

  const ids = hits.map(getId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const liveProjects = await prisma.project.findMany({
    where: {
      id: { in: ids },
      published: true,
    },
    select: { id: true },
  });

  const liveIds = new Set(liveProjects.map((project) => project.id));
  return hits.filter((hit) => {
    const id = getId(hit);
    return id !== null && liveIds.has(id);
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const trimmedQuery = q.trim();
  const type = searchParams.get("type") ?? "all";
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? "8"), 50);
  const offset = Number(searchParams.get("offset") ?? "0");

  // Projects-only (legacy/filtered) path
  if (type === "projects") {
    const filters: string[] = ["published = true"];
    if (category) filters.push(`category = "${category}"`);
    if (status) filters.push(`status = "${status}"`);

    const results = await searchProjects(q, {
      filter: filters.join(" AND "),
      sort: trimmedQuery ? undefined : ["createdAt:desc"],
      limit,
      offset,
    });
    const hits = rerankProjectHits(await filterToLiveProjectHits(results.hits), q);
    return jsonNoStore({ ...results, hits, estimatedTotalHits: hits.length });
  }

  if (type === "designers") {
    const results = await searchDesigners(q, { limit, offset });
    return jsonNoStore(results);
  }

  if (type === "vendors") {
    const results = await searchVendors(q, { limit, offset });
    return jsonNoStore(results);
  }

  // type=all (default): query all three indexes in parallel
  const filters: string[] = ["published = true"];
  if (category) filters.push(`category = "${category}"`);
  if (status) filters.push(`status = "${status}"`);

  const [projectResults, designerResults, vendorResults] = await Promise.all([
    searchProjects(q, {
      filter: filters.join(" AND "),
      sort: trimmedQuery ? undefined : ["createdAt:desc"],
      limit,
      offset,
    }),
    searchDesigners(q, { limit, offset }),
    searchVendors(q, { limit, offset }),
  ]);

  const projectHits = rerankProjectHits(await filterToLiveProjectHits(projectResults.hits), q);

  return jsonNoStore({
    projects: projectHits,
    designers: designerResults.hits,
    vendors: vendorResults.hits,
    // Backward compat: legacy consumers reading `hits` get project hits
    hits: projectHits,
  });
}
