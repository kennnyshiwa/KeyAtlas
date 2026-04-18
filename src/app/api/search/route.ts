import { NextRequest, NextResponse } from "next/server";
import { searchProjects, searchDesigners, searchVendors } from "@/lib/meilisearch";
import { prisma } from "@/lib/prisma";

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
      sort: ["createdAt:desc"],
      limit,
      offset,
    });
    const hits = await filterToLiveProjectHits(results.hits);
    return NextResponse.json({ ...results, hits, estimatedTotalHits: hits.length });
  }

  if (type === "designers") {
    const results = await searchDesigners(q, { limit, offset });
    return NextResponse.json(results);
  }

  if (type === "vendors") {
    const results = await searchVendors(q, { limit, offset });
    return NextResponse.json(results);
  }

  // type=all (default): query all three indexes in parallel
  const filters: string[] = ["published = true"];
  if (category) filters.push(`category = "${category}"`);
  if (status) filters.push(`status = "${status}"`);

  const [projectResults, designerResults, vendorResults] = await Promise.all([
    searchProjects(q, {
      filter: filters.join(" AND "),
      sort: ["createdAt:desc"],
      limit,
      offset,
    }),
    searchDesigners(q, { limit, offset }),
    searchVendors(q, { limit, offset }),
  ]);

  const projectHits = await filterToLiveProjectHits(projectResults.hits);

  return NextResponse.json({
    projects: projectHits,
    designers: designerResults.hits,
    vendors: vendorResults.hits,
    // Backward compat: legacy consumers reading `hits` get project hits
    hits: projectHits,
  });
}
