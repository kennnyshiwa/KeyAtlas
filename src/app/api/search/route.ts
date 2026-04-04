import { NextRequest, NextResponse } from "next/server";
import { searchProjects, searchDesigners, searchVendors } from "@/lib/meilisearch";

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
    return NextResponse.json({ ...results, hits: results.hits });
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

  return NextResponse.json({
    projects: projectResults.hits,
    designers: designerResults.hits,
    vendors: vendorResults.hits,
    // Backward compat: legacy consumers reading `hits` get project hits
    hits: projectResults.hits,
  });
}
