import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Regex for cuid strings — detects raw vendor IDs in summaries
const CUID_RE = /\bc[a-z0-9]{24,}\b/g;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const logs = await prisma.projectChangeLog.findMany({
    where: { projectId: id },
    include: {
      actor: { select: { name: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Resolve any raw vendor IDs still embedded in summaries/oldValue/newValue
  // (from entries created before the vendor-name fix)
  const cuidSet = new Set<string>();
  for (const log of logs) {
    for (const val of [log.summary, log.oldValue, log.newValue]) {
      if (val) {
        for (const match of val.matchAll(CUID_RE)) {
          cuidSet.add(match[0]);
        }
      }
    }
  }

  let vendorNames = new Map<string, string>();
  if (cuidSet.size > 0) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: Array.from(cuidSet) } },
      select: { id: true, name: true },
    });
    vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
  }

  // Replace cuid tokens with vendor names in returned data
  function resolveIds(text: string | null): string | null {
    if (!text || vendorNames.size === 0) return text;
    return text.replace(CUID_RE, (id) => vendorNames.get(id) ?? id);
  }

  const resolved = logs.map((log) => ({
    ...log,
    summary: resolveIds(log.summary)!,
    oldValue: resolveIds(log.oldValue),
    newValue: resolveIds(log.newValue),
  }));

  return NextResponse.json({ logs: resolved });
}
