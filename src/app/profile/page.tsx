import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, User, ExternalLink } from "lucide-react";

export const metadata = {
  title: "My Profile",
  description: "View and manage your profile and project submissions.",
};

interface ProfilePageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const tab = params.tab;
  const defaultTab =
    tab === "settings" || tab === "api" || tab === "favorites" || tab === "collection"
      ? tab
      : "projects";
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [user, projects, favoriteRecords, collectionRecords, apiKeys, followerCount, followingCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          username: true,
          displayName: true,
          bio: true,
          email: true,
          image: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.project.findMany({
        where: { creatorId: session.user.id },
        include: { vendor: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.favorite.findMany({
        where: { userId: session.user.id },
        include: {
          project: {
            include: { vendor: { select: { name: true, slug: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userCollection.findMany({
        where: { userId: session.user.id },
        include: {
          project: {
            include: { vendor: { select: { name: true, slug: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.apiKey.findMany({
        where: { userId: session.user.id, revoked: false },
        select: {
          id: true,
          name: true,
          prefix: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.follow.count({
        where: { targetType: "USER", targetUserId: session.user.id },
      }),
      prisma.follow.count({
        where: { userId: session.user.id },
      }),
    ]);

  if (!user) redirect("/sign-in");

  const favorites = favoriteRecords.map((f) => f.project);
  const collection = collectionRecords.map((c) => c.project);

  const totalSubmitted = projects.length;
  const publishedCount = projects.filter((p) => p.published).length;
  const pendingCount = projects.filter((p) => !p.published).length;

  const serializedApiKeys = apiKeys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
  }));

  const serializedUser = {
    ...user,
    createdAt: user.createdAt.toISOString(),
  };

  const initials = (user.displayName || user.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.image ?? undefined} alt={user.displayName || user.name || "User"} />
            <AvatarFallback className="text-lg">
              {initials || <User className="h-6 w-6" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">
              {user.displayName || user.name || "Anonymous"}
            </h1>
            {user.username && (
              <p className="text-muted-foreground text-sm">@{user.username}</p>
            )}
            {user.bio && (
              <p className="text-muted-foreground mt-1 max-w-md text-sm">{user.bio}</p>
            )}
            <div className="text-muted-foreground mt-1 flex gap-3 text-xs">
              <span>{followerCount} followers</span>
              <span>{followingCount} following</span>
              <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {user.username && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/users/${user.username}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Public Profile
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href="/projects/submit">
              <Plus className="mr-2 h-4 w-4" />
              Submit Project
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalSubmitted}</div>
            <p className="text-muted-foreground text-sm">Total Submitted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{publishedCount}</div>
            <p className="text-muted-foreground text-sm">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-muted-foreground text-sm">Draft / Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{favorites.length}</div>
            <p className="text-muted-foreground text-sm">Favorites</p>
          </CardContent>
        </Card>
      </div>

      <ProfileTabs
        projects={projects}
        favorites={favorites}
        collection={collection}
        apiKeys={serializedApiKeys}
        user={serializedUser}
        defaultTab={defaultTab}
      />
    </div>
  );
}
