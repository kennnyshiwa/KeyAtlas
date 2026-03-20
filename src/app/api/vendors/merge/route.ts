import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const mergeSchema = z.object({
  targetId: z.string().min(1, "Target vendor is required"),
  sourceIds: z.array(z.string()).min(1, "At least one source vendor is required"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const result = mergeSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { targetId, sourceIds } = result.data;

  const filteredSourceIds = sourceIds.filter((id) => id !== targetId);
  if (filteredSourceIds.length === 0) {
    return NextResponse.json(
      { error: "Cannot merge a vendor into itself" },
      { status: 400 }
    );
  }

  const target = await prisma.vendor.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Target vendor not found" }, { status: 404 });
  }

  const sources = await prisma.vendor.findMany({
    where: { id: { in: filteredSourceIds } },
    select: { id: true, name: true },
  });

  if (sources.length !== filteredSourceIds.length) {
    return NextResponse.json({ error: "One or more source vendors not found" }, { status: 404 });
  }

  // Reassign direct vendor relation on projects
  const projectsUpdated = await prisma.project.updateMany({
    where: { vendorId: { in: filteredSourceIds } },
    data: { vendorId: targetId },
  });

  // Reassign projectVendors (many-to-many) — skip if target already linked to same project+region
  const existingLinks = await prisma.projectVendor.findMany({
    where: { vendorId: targetId },
    select: { projectId: true, region: true },
  });
  const existingLinkKeys = new Set(
    existingLinks.map((l) => `${l.projectId}:${l.region ?? ""}`)
  );

  const sourceLinks = await prisma.projectVendor.findMany({
    where: { vendorId: { in: filteredSourceIds } },
  });

  let movedLinks = 0;
  for (const link of sourceLinks) {
    const key = `${link.projectId}:${link.region ?? ""}`;
    if (existingLinkKeys.has(key)) {
      // Target already linked to this project+region — just delete the source link
      await prisma.projectVendor.delete({ where: { id: link.id } });
    } else {
      // Reassign to target
      await prisma.projectVendor.update({
        where: { id: link.id },
        data: { vendorId: targetId },
      });
      existingLinkKeys.add(key);
      movedLinks++;
    }
  }

  // Reassign followers — skip dupes (user already follows target)
  const existingFollowers = await prisma.follow.findMany({
    where: { targetVendorId: targetId },
    select: { userId: true },
  });
  const existingFollowerIds = new Set(existingFollowers.map((f) => f.userId));

  const sourceFollowers = await prisma.follow.findMany({
    where: { targetVendorId: { in: filteredSourceIds } },
  });

  for (const follow of sourceFollowers) {
    if (existingFollowerIds.has(follow.userId)) {
      await prisma.follow.delete({ where: { id: follow.id } });
    } else {
      await prisma.follow.update({
        where: { id: follow.id },
        data: { targetVendorId: targetId, targetId: targetId },
      });
      existingFollowerIds.add(follow.userId);
    }
  }

  // Delete source vendors (cascades remaining relations)
  await prisma.vendor.deleteMany({
    where: { id: { in: filteredSourceIds } },
  });

  return NextResponse.json({
    success: true,
    merged: sources.map((s) => s.name),
    into: target.name,
    projectsMoved: projectsUpdated.count,
    linksMoved: movedLinks,
  });
}
