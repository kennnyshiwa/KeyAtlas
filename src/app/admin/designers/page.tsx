import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { DesignerMergeDialog } from "@/components/admin/designer-merge-dialog";
import { AdminDesignersInfiniteTable } from "@/components/admin/admin-designers-infinite-table";

export const metadata = {
  title: "Manage Designers",
};

const PAGE_SIZE = 25;

export default async function AdminDesignersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const params = await searchParams;
  const q = params.q?.trim() || "";
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
          {
            projects: {
              some: {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { slug: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const [total, designers] = await prisma.$transaction([
    prisma.designer.count({ where }),
    prisma.designer.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Manage Designers" description="Search and manage designer profiles without loading the whole directory at once.">
        <div className="flex gap-2">
          <DesignerMergeDialog />
          <Button asChild>
            <Link href="/admin/designers/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Designer
            </Link>
          </Button>
        </div>
      </PageHeader>

      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-4" method="GET">
        <Input
          name="q"
          placeholder="Search name, slug, or project"
          defaultValue={q}
          className="md:col-span-3"
        />
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          {q && (
            <Button asChild type="button" variant="outline">
              <Link href="/admin/designers">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <AdminDesignersInfiniteTable
        initialDesigners={designers}
        total={total}
        pageSize={PAGE_SIZE}
        searchParams={{
          q: q || undefined,
        }}
      />
    </div>
  );
}
