import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = {
  title: "My Projects",
  description: "View and manage your project submissions.",
};

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [projects, favoriteRecords, collectionRecords, apiKeys] = await Promise.all([
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
  ]);

  const favorites = favoriteRecords.map((f) => f.project);
  const collection = collectionRecords.map((c) => c.project);

  const totalSubmitted = projects.length;
  const publishedCount = projects.filter((p) => p.published).length;
  const pendingCount = projects.filter((p) => !p.published).length;

  // Serialize dates for client component
  const serializedApiKeys = apiKeys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Projects"
        description="View and manage your project submissions."
      >
        <Button asChild>
          <Link href="/projects/submit">
            <Plus className="mr-2 h-4 w-4" />
            Submit a Project
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
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
            <p className="text-muted-foreground text-sm">Pending Review</p>
          </CardContent>
        </Card>
      </div>

      <ProfileTabs
        projects={projects}
        favorites={favorites}
        collection={collection}
        apiKeys={serializedApiKeys}
      />
    </div>
  );
}
