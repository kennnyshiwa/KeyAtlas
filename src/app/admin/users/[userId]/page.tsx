import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserActions } from "./user-actions";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      username: true,
      role: true,
      createdAt: true,
      emailVerified: true,
      bannedAt: true,
      banReason: true,
      lastSeenAt: true,
      forcePasswordReset: true,
      _count: {
        select: {
          projects: true,
          comments: true,
          forumPosts: true,
        },
      },
    },
  });

  if (!user) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.displayName || user.name || user.email || "User"}
        description={user.email || user.id}
      />

      <Card>
        <CardHeader>
          <CardTitle>Account info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Username: {user.username || "—"}</p>
          <p>Role: <Badge variant="outline">{user.role}</Badge></p>
          <p>Email verified: {user.emailVerified ? "Yes" : "No"}</p>
          <p>Created: {formatDate(user.createdAt)}</p>
          <p>Last seen: {user.lastSeenAt ? formatDate(user.lastSeenAt) : "—"}</p>
          <p>Status: {user.bannedAt ? <Badge variant="destructive">Banned</Badge> : <Badge>Active</Badge>}</p>
          {user.banReason && <p>Ban reason: {user.banReason}</p>}
          {user.forcePasswordReset && <p>Password reset required: Yes</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <UserActions
            userId={user.id}
            isBanned={Boolean(user.bannedAt)}
            currentRole={user.role}
            canEdit={session?.user.role === "ADMIN"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <p>Projects: {user._count.projects}</p>
          <p>Comments: {user._count.comments}</p>
          <p>Forum posts: {user._count.forumPosts}</p>
        </CardContent>
      </Card>
    </div>
  );
}
