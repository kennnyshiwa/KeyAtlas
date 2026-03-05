import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectFormSchema } from "@/lib/validations/project";
import { indexProject, removeProjectFromIndex } from "@/lib/meilisearch";
import { slugify } from "@/lib/slug";
import { REQUIRE_PROJECT_REVIEW } from "@/lib/feature-flags";
import { dispatchNotification } from "@/lib/notifications/service";
import { STATUS_LABELS } from "@/lib/constants";
import { rateLimit, RATE_LIMIT_PROJECT_UPDATE } from "@/lib/rate-limit";
import { logProjectChanges } from "@/lib/project-change-log";
import { logAdminAction } from "@/lib/admin-audit";

async function findOrCreateVendorByEntry(entry: {
  vendorId: string;
  customVendorName?: string | null;
  customVendorWebsite?: string | null;
}) {
  if (entry.vendorId && entry.vendorId !== "__new__") return entry.vendorId;

  const rawName = entry.customVendorName?.trim();
  if (!rawName) return null;

  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: rawName, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const baseSlug = slugify(rawName) || "vendor";
  let slug = baseSlug;
  let i = 1;
  while (await prisma.vendor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const created = await prisma.vendor.create({
    data: {
      name: rawName,
      slug,
      storefrontUrl: entry.customVendorWebsite || null,
      verified: false,
      regionsServed: [],
    },
    select: { id: true },
  });

  return created.id;
}


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      links: true,
      vendor: true,
      creator: { select: { id: true, name: true, image: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const intent = searchParams.get("intent");
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const isStaff = isAdmin || session.user.role === "MODERATOR";

  // Staff can edit any project. Regular users can only edit their own.
  // When review is required, non-staff can only edit unpublished drafts.
  if (!isStaff) {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { creatorId: true, published: true },
    });
    if (!existing || existing.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (REQUIRE_PROJECT_REVIEW && existing.published) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  // Rate limit
  const rateLimited = await rateLimit(session.user.id, "project:update", RATE_LIMIT_PROJECT_UPDATE, { skipIfAdmin: isAdmin });
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const result = projectFormSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const { images, links, projectVendors, ...data } = result.data;

  // Vendor required for GROUP_BUY status
  if (data.status === "GROUP_BUY" && projectVendors.length === 0) {
    return NextResponse.json(
      { error: "At least one vendor is required for Group Buy projects." },
      { status: 400 }
    );
  }

  // Normalize slug to URL-safe ASCII to prevent 404s from Unicode slugs
  data.slug = slugify(data.slug) || slugify(data.title) || `project-${Date.now()}`;

  // Non-admin users cannot feature projects.
  // When REQUIRE_PROJECT_REVIEW is off, non-admin projects are auto-published.
  if (!isAdmin) {
    data.featured = false;
    data.published = REQUIRE_PROJECT_REVIEW ? false : true;
  }

  // Optional explicit intent for draft/review/publish/preview while keeping legacy payload compatibility
  if (intent === "draft") {
    data.published = false;
  }
  if (intent === "review") {
    // When review is disabled, treat review intent as publish for everyone.
    data.published = REQUIRE_PROJECT_REVIEW ? false : true;
  }
  if (intent === "publish" && isAdmin) {
    data.published = true;
  }
  // intent=preview preserves payload published state (admins) while still saving latest edits.

  // Fetch current project to detect status transitions and log changes
  const currentProject = await prisma.project.findUnique({
    where: { id },
    select: { status: true, title: true, slug: true, category: true, profile: true, designer: true, vendorId: true },
  });

  const slugConflict = await prisma.project.findFirst({
    where: { slug: data.slug, NOT: { id } },
  });
  if (slugConflict) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  const resolvedVendors = (
    await Promise.all(
      projectVendors.map(async (pv) => ({
        ...pv,
        vendorId: await findOrCreateVendorByEntry({
          vendorId: pv.vendorId,
          customVendorName: pv.customVendorName,
          customVendorWebsite: pv.customVendorWebsite,
        }),
      }))
    )
  ).filter((pv) => !!pv.vendorId) as Array<{
    vendorId: string;
    region?: string;
    storeLink?: string;
    endDate?: Date | null;
  }>;

  // Log meaningful field changes
  if (currentProject) {
    await logProjectChanges(id, session.user.id, currentProject as Record<string, unknown>, data as Record<string, unknown>);
  }

  const project = await prisma.$transaction(async (tx) => {
    await tx.projectImage.deleteMany({ where: { projectId: id } });
    await tx.projectLink.deleteMany({ where: { projectId: id } });
    await tx.projectVendor.deleteMany({ where: { projectId: id } });

    // Auto-set vendorId from first projectVendor for backward compat
    const primaryVendorId = resolvedVendors.length > 0 ? resolvedVendors[0].vendorId : null;

    return tx.project.update({
      where: { id },
      data: {
        ...data,
        vendorId: primaryVendorId,
        images: { create: images },
        links: { create: links },
        projectVendors: {
          create: resolvedVendors.map((pv) => ({
            vendorId: pv.vendorId,
            region: pv.region || null,
            storeLink: pv.storeLink || null,
            endDate: pv.endDate ?? null,
          })),
        },
      },
      include: {
        images: true,
        links: true,
        vendor: { select: { name: true, slug: true } },
        projectVendors: { include: { vendor: { select: { name: true, slug: true } } } },
      },
    });
  });

  if (project.published) {
    await indexProject(project);
  }

  if (isStaff) {
    await logAdminAction({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "PROJECT_UPDATED",
      resource: "PROJECT",
      resourceId: id,
      targetId: id,
      metadata: { intent: intent ?? null, status: data.status, published: data.published },
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });
  }

  // Notify followers on status change
  if (currentProject && currentProject.status !== data.status) {
    const followers = await prisma.follow.findMany({
      where: { targetType: "PROJECT", targetId: id },
      select: { userId: true },
    });

    if (followers.length > 0) {
      const oldLabel = STATUS_LABELS[currentProject.status];
      const newLabel = STATUS_LABELS[data.status];

      await dispatchNotification({
        recipients: followers.map((f) => f.userId),
        // Include self-notifications for project status changes so owners/admins
        // who follow their own project still receive update emails.
        preferenceType: "PROJECT_UPDATES",
        notificationType: "PROJECT_STATUS_CHANGE",
        title: `${currentProject.title} status changed`,
        message: `${currentProject.title} moved from ${oldLabel} to ${newLabel}.`,
        link: `/projects/${currentProject.slug}`,
        emailSubject: `${currentProject.title} is now ${newLabel}`,
        emailHeading: `Status Update: ${currentProject.title}`,
        emailCtaLabel: "View project",
      });
    }
  }

  return NextResponse.json(project);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.project.delete({ where: { id } });
  await removeProjectFromIndex(id);

  await logAdminAction({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "PROJECT_DELETED",
    resource: "PROJECT",
    resourceId: id,
    targetId: id,
    ipAddress: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ success: true });
}
