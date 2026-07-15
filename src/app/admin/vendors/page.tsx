import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { VendorMergeDialog } from "@/components/admin/vendor-merge-dialog";
import { AdminVendorsInfiniteTable } from "@/components/admin/admin-vendors-infinite-table";
import { sortByNameCaseInsensitive } from "@/lib/sort-by-name";

export const metadata = {
  title: "Manage Vendors",
};

const PAGE_SIZE = 25;

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }
  const isAdmin = session.user.role === "ADMIN";

  const params = await searchParams;
  const q = params.q?.trim() || "";
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
          { storefrontUrl: { contains: q, mode: "insensitive" as const } },
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
          {
            projectVendors: {
              some: {
                project: {
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { slug: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};

  const [total, vendorsRaw] = await prisma.$transaction([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        regionsServed: true,
        verified: true,
        _count: { select: { projects: true, projectVendors: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const vendors = sortByNameCaseInsensitive(vendorsRaw).slice(0, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Vendors"
        description="Search and manage vendors without loading the full vendor directory at once."
      >
        <div className="flex gap-2">
          {isAdmin && <VendorMergeDialog />}
          {isAdmin && (
            <Button asChild>
              <Link href="/admin/vendors/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Vendor
              </Link>
            </Button>
          )}
        </div>
      </PageHeader>

      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-4" method="GET">
        <Input
          name="q"
          placeholder="Search name, slug, website, or project"
          defaultValue={q}
          className="md:col-span-3"
        />
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          {q && (
            <Button asChild type="button" variant="outline">
              <Link href="/admin/vendors">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <AdminVendorsInfiniteTable
        initialVendors={vendors}
        total={total}
        pageSize={PAGE_SIZE}
        searchParams={{ q: q || undefined }}
        isAdmin={isAdmin}
      />
    </div>
  );
}
