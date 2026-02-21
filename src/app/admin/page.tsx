import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { STATUS_LABELS } from "@/lib/constants";
import type { ProjectStatus } from "@/generated/prisma/client";

export const metadata = {
  title: "Admin Dashboard",
};

export default async function AdminDashboardPage() {
  const statusCounts = await prisma.project.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const totalProjects = await prisma.project.count();
  const publishedCount = await prisma.project.count({
    where: { published: true },
  });

  const countMap = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count.id])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your KeyAtlas projects."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{publishedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalProjects - publishedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects by Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="text-sm">{label}</span>
                <span className="font-semibold">
                  {countMap[status as ProjectStatus] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
