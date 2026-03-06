import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMIT_LIST } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Public endpoint, but rate-limited by IP
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const limited = await rateLimit(ip, "v1:activity", RATE_LIMIT_LIST);
  if (limited) return limited;

  const [recentProjects, recentComments, recentThreads, recentUpdates] =
    await Promise.all([
      prisma.project.findMany({
        where: { published: true },
        include: {
          creator: { select: { id: true, username: true, displayName: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.comment.findMany({
        include: {
          user: { select: { id: true, username: true, displayName: true, image: true } },
          project: { select: { id: true, title: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.forumThread.findMany({
        include: {
          author: { select: { id: true, username: true, displayName: true, image: true } },
          category: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.projectUpdate.findMany({
        include: {
          project: {
            select: {
              id: true,
              title: true,
              slug: true,
              creator: { select: { id: true, username: true, displayName: true, image: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  type ActivityItem = {
    id: string;
    type: string;
    title: string;
    message: string;
    link: string;
    user: { id: string; username: string | null; name: string | null; avatar_url: string | null };
    project: { id: string; title: string; slug: string } | null;
    created_at: Date;
  };

  const items: ActivityItem[] = [
    ...recentProjects.map((p) => ({
      id: `project-${p.id}`,
      type: "new_project",
      title: `New project: ${p.title}`,
      message: `submitted a new project`,
      link: `/projects/${p.slug}`,
      user: {
        id: p.creator.id,
        username: p.creator.username,
        name: p.creator.displayName,
        avatar_url: p.creator.image,
      },
      project: { id: p.id, title: p.title, slug: p.slug },
      created_at: p.createdAt,
    })),
    ...recentComments.map((c) => ({
      id: `comment-${c.id}`,
      type: "comment",
      title: `Comment on ${c.project.title}`,
      message: `commented on ${c.project.title}`,
      link: `/projects/${c.project.slug}#comment-${c.id}`,
      user: {
        id: c.user.id,
        username: c.user.username,
        name: c.user.displayName,
        avatar_url: c.user.image,
      },
      project: { id: c.project.id, title: c.project.title, slug: c.project.slug },
      created_at: c.createdAt,
    })),
    ...recentThreads.map((t) => ({
      id: `thread-${t.id}`,
      type: "forum_thread",
      title: t.title,
      message: `started a thread in ${t.category.name}`,
      link: `/forums/${t.category.slug}/${t.slug}`,
      user: {
        id: t.author.id,
        username: t.author.username,
        name: t.author.displayName,
        avatar_url: t.author.image,
      },
      project: null,
      created_at: t.createdAt,
    })),
    ...recentUpdates.map((u) => ({
      id: `update-${u.id}`,
      type: "project_update",
      title: `Update: ${u.title}`,
      message: `posted an update on ${u.project.title}`,
      link: `/projects/${u.project.slug}`,
      user: {
        id: u.project.creator.id,
        username: u.project.creator.username,
        name: u.project.creator.displayName,
        avatar_url: u.project.creator.image,
      },
      project: { id: u.project.id, title: u.project.title, slug: u.project.slug },
      created_at: u.createdAt,
    })),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  return NextResponse.json({ data: items.slice(0, 30) });
}
