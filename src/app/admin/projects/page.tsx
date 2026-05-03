import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/constants";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProjectStatus } from "@/generated/prisma/client";
import { AdminProjectsInfiniteTable } from "@/components/admin/admin-projects-infinite-table";

export const metadata = {
  title: "Manage Projects",
};

const PAGE_SIZE = 25;

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    published?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const status =
    params.status && Object.values(ProjectStatus).includes(params.status as ProjectStatus)
      ? (params.status as ProjectStatus)
      : undefined;
  const published =
    params.published === "live" || params.published === "draft"
      ? params.published
      : undefined;
  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            {
              vendor: {
                is: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
            {
              projectVendors: {
                some: {
                  vendor: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
            },
            { designer: { contains: q, mode: "insensitive" as const } },
            {
              designerProfile: {
                is: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(published === "live" ? { published: true } : {}),
    ...(published === "draft" ? { published: false } : {}),
  };

  const [total, projects] = await prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        published: true,
        createdAt: true,
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Search, filter, and manage all projects.">
        <Button asChild>
          <Link href="/admin/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </PageHeader>

      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-4" method="GET">
        <Input
          name="q"
          placeholder="Search title, slug, vendor, or designer"
          defaultValue={q}
          className="md:col-span-2"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="published"
          defaultValue={published ?? ""}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All visibility</option>
          <option value="live">Live</option>
          <option value="draft">Draft</option>
        </select>
        <div className="flex gap-2 md:col-span-4">
          <Button type="submit">Apply filters</Button>
          {(q || status || published) && (
            <Button asChild type="button" variant="outline">
              <Link href="/admin/projects">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <AdminProjectsInfiniteTable
        initialProjects={projects}
        total={total}
        pageSize={PAGE_SIZE}
        searchParams={{
          q: q || undefined,
          status,
          published,
        }}
      />
    </div>
  );
}
