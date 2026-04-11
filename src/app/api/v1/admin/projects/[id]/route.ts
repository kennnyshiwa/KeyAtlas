import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { indexProject, removeProjectFromIndex } from "@/lib/meilisearch";
import { notifyWatchlistMatches } from "@/lib/notifications/watchlist";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_PROJECT_UPDATE } from "@/lib/rate-limit";

async function requireAdmin(req: NextRequest) {
  const user = await authenticateApiKey(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (dbUser?.role !== "ADMIN") return null;
  return user;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(user.id, "v1:admin:projects:update", RATE_LIMIT_PROJECT_UPDATE);
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.published === "boolean") data.published = body.published;

  const project = await prisma.project.update({
    where: { id },
    data,
    include: {
      vendor: { select: { name: true, slug: true } },
    },
  });

  if (project.published) {
    await indexProject(project);

    if (!existing.published) {
      await notifyWatchlistMatches({
        id: project.id,
        title: project.title,
        slug: project.slug,
        category: project.category,
        status: project.status,
        profile: project.profile,
        designer: project.designer,
        vendorId: project.vendorId,
        shipped: project.shipped,
        tags: project.tags,
        creatorId: project.creatorId,
      });
    }
  } else if (existing.published) {
    await removeProjectFromIndex(project.id);
  }

  return NextResponse.json({ data: project });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(user.id, "v1:admin:projects:delete", RATE_LIMIT_PROJECT_UPDATE);
  if (limited) return limited;

  const { id } = await params;

  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
