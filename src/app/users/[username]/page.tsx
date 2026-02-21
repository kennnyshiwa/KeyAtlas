import { notFound } from "next/navigation";
import Script from "next/script";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ProjectGrid } from "@/components/projects/project-grid";
import { FollowButton } from "@/components/social/follow-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { User, Calendar } from "lucide-react";
import type { Metadata } from "next";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ username: string }>;
}

function profileDescription(displayName: string, bio?: string | null) {
  return bio?.trim() || `${displayName}'s profile on ${SITE_NAME}.`;
}

function profileImage(username: string, image?: string | null) {
  return image || `https://avatar.vercel.sh/${encodeURIComponent(username)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { displayName: true, name: true, username: true, bio: true, image: true },
  });
  if (!user) return { title: "User Not Found" };
  const displayName = user.displayName || user.name || user.username || "User";
  const usernameValue = user.username ?? "user";
  const siteUrl = getSiteUrl();
  const canonical = new URL(`/users/${usernameValue}`, siteUrl).toString();
  const description = profileDescription(displayName, user.bio);
  const title = `${displayName} (@${usernameValue})`;
  const image = profileImage(usernameValue, user.image);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
      siteName: SITE_NAME,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      displayName: true,
      bio: true,
      image: true,
      createdAt: true,
    },
  });

  if (!user) notFound();

  const session = await auth();

  const [projects, favoriteCount, collectionCount, followerCount, followingCount, isFollowing] =
    await Promise.all([
      prisma.project.findMany({
        where: { creatorId: user.id, published: true },
        include: { vendor: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.favorite.count({ where: { userId: user.id } }),
      prisma.userCollection.count({ where: { userId: user.id } }),
      prisma.follow.count({ where: { targetType: "USER", targetUserId: user.id } }),
      prisma.follow.count({ where: { userId: user.id } }),
      session?.user
        ? prisma.follow
            .findUnique({
              where: {
                userId_targetType_targetId: {
                  userId: session.user.id,
                  targetType: "USER",
                  targetId: user.id,
                },
              },
            })
            .then((f) => !!f)
        : Promise.resolve(false),
    ]);

  const displayName = user.displayName || user.name || user.username || "User";
  const usernameValue = user.username ?? "user";
  const initials = (displayName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isOwnProfile = session?.user?.id === user.id;
  const siteUrl = getSiteUrl();
  const canonical = new URL(`/users/${usernameValue}`, siteUrl).toString();
  const description = profileDescription(displayName, user.bio);
  const image = profileImage(usernameValue, user.image);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: displayName,
    description,
    image,
    url: canonical,
  };

  return (
    <div className="space-y-6">
      <Script
        id="user-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Profile Header */}
      <div className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
        <Avatar className="h-24 w-24">
          <AvatarImage src={user.image ?? undefined} alt={displayName || "User"} />
          <AvatarFallback className="text-2xl">
            {initials || <User className="h-10 w-10" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <p className="text-muted-foreground">@{usernameValue}</p>
          {user.bio && (
            <p className="mt-2 max-w-lg text-sm">{user.bio}</p>
          )}
          <div className="text-muted-foreground mt-2 flex items-center justify-center gap-4 text-sm sm:justify-start">
            <span className="font-medium text-foreground">{followerCount}</span> followers
            <span className="font-medium text-foreground">{followingCount}</span> following
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        {!isOwnProfile && session?.user && (
          <FollowButton
            targetType="USER"
            targetId={user.id}
            initialFollowing={isFollowing}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-muted-foreground text-sm">Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{favoriteCount}</div>
            <p className="text-muted-foreground text-sm">Favorites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">{collectionCount}</div>
            <p className="text-muted-foreground text-sm">Collection</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects */}
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="projects" className="mt-4">
          {projects.length > 0 ? (
            <ProjectGrid projects={projects} />
          ) : (
            <EmptyState
              title="No public projects"
              description="This user hasn't published any projects yet."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
