import { NextRequest, NextResponse } from "next/server";
import { searchProjects } from "@/lib/meilisearch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);
  const offset = Number(searchParams.get("offset") ?? "0");

  const filters: string[] = ["published = true"];
  if (category) filters.push(`category = "${category}"`);
  if (status) filters.push(`status = "${status}"`);

  const results = await searchProjects(q, {
    filter: filters.join(" AND "),
    sort: ["createdAt:desc"],
    limit,
    offset,
  });

  return NextResponse.json(results);
}
