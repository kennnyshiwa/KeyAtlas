import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  MessageSquare,
  Star,
  FileText,
  Keyboard,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const metadata = {
  title: "Activity",
  description: "Recent community activity on KeyAtlas.",
  alternates: { canonical: "/activity" },
};

export default async function ActivityPage() {
  const [recentProjects, recentComments, recentThreads, recentUpdates] =
    await Promise.all([
      prisma.project.findMany({
        where: { published: true },
        include: {
          creator: { select: { name: true, displayName: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.comment.findMany({
        include: {
          user: { select: { name: true, displayName: true, image: true } },
          project: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.forumThread.findMany({
        include: {
          author: { select: { name: true, displayName: true, image: true } },
          category: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.projectUpdate.findMany({
        include: {
          project: {
            select: {
              title: true,
              slug: true,
              creator: { select: { name: true, displayName: true, image: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  // Merge and sort all activity
  type ActivityItem = {
    id: string;
    type: "project" | "comment" | "thread" | "update";
    title: string;
    description: string;
    link: string;
    userName: string;
    userImage: string | null;
    createdAt: Date;
  };

  const items: ActivityItem[] = [
    ...recentProjects.map((p) => ({
      id: `p-${p.id}`,
      type: "project" as const,
      title: `New project: ${p.title}`,
      description: `submitted a new ${p.category.toLowerCase()} project`,
      link: `/projects/${p.slug}`,
      userName: p.creator.displayName || p.creator.name || "Anonymous",
      userImage: p.creator.image,
      createdAt: p.createdAt,
    })),
    ...recentComments.map((c) => ({
      id: `c-${c.id}`,
      type: "comment" as const,
      title: `Comment on ${c.project.title}`,
      description: `commented on ${c.project.title}`,
      link: `/projects/${c.project.slug}#comment-${c.id}`,
      userName: c.user.displayName || c.user.name || "Anonymous",
      userImage: c.user.image,
      createdAt: c.createdAt,
    })),
    ...recentThreads.map((t) => ({
      id: `t-${t.id}`,
      type: "thread" as const,
      title: t.title,
      description: `started a thread in ${t.category.name}`,
      link: `/forums/${t.category.slug}/${t.slug}`,
      userName: t.author.displayName || t.author.name || "Anonymous",
      userImage: t.author.image,
      createdAt: t.createdAt,
    })),
    ...recentUpdates.map((u) => ({
      id: `u-${u.id}`,
      type: "update" as const,
      title: `Update: ${u.title}`,
      description: `posted an update on ${u.project.title}`,
      link: `/projects/${u.project.slug}`,
      userName:
        u.project.creator.displayName || u.project.creator.name || "Anonymous",
      userImage: u.project.creator.image,
      createdAt: u.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const typeIcons = {
    project: <Keyboard className="h-4 w-4 text-blue-500" />,
    comment: <MessageSquare className="h-4 w-4 text-green-500" />,
    thread: <FileText className="h-4 w-4 text-purple-500" />,
    update: <RefreshCw className="h-4 w-4 text-amber-500" />,
  };

  const typeLabels = {
    project: "New Project",
    comment: "Comment",
    thread: "Forum Thread",
    update: "Project Update",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Feed"
        description="See what's happening in the KeyAtlas community."
      />

      <div className="space-y-2">
        {items.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-12 text-center">
              No activity yet. Check back soon!
            </CardContent>
          </Card>
        ) : (
          items.slice(0, 30).map((item) => {
            const initials = item.userName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <Link key={item.id} href={item.link}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={item.userImage ?? undefined} />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {typeIcons[item.type]}
                        <span className="truncate text-sm font-medium">
                          {item.userName}
                        </span>
                        <span className="text-muted-foreground truncate text-sm">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[item.type]}
                      </Badge>
                      <span className="text-muted-foreground whitespace-nowrap text-xs">
                        {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
