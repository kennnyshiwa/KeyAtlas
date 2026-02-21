import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { VendorCard } from "@/components/vendors/vendor-card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Keyboard Vendors Directory | KeyAtlas",
  description:
    "Discover trusted keyboard vendors, their regional coverage, and recent launches from each shop.",
  alternates: { canonical: "/discover/vendors" },
};

export default async function DiscoverVendorsPage() {
  const [verifiedVendors, activeVendors, latestVendorProjects] = await Promise.all([
    prisma.vendor.findMany({
      where: { verified: true },
      select: {
        name: true,
        slug: true,
        logo: true,
        regionsServed: true,
        verified: true,
        _count: { select: { projectVendors: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({
      select: {
        name: true,
        slug: true,
        logo: true,
        regionsServed: true,
        verified: true,
        _count: { select: { projectVendors: true } },
      },
      orderBy: { projectVendors: { _count: "desc" } },
      take: 18,
    }),
    prisma.project.findMany({
      where: { published: true, vendorId: { not: null } },
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Vendors"
        description="Find vetted shops and see what they're stocking or running next."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/vendors">Full directory</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover/group-buys">Group buys</Link>
        </Button>
      </PageHeader>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Verified
          </Badge>
          <h2 className="text-xl font-semibold">Trusted vendors</h2>
        </div>
        {verifiedVendors.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {verifiedVendors.map((vendor) => (
              <VendorCard key={vendor.slug} vendor={vendor} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No verified vendors yet"
            description="Verified partners will appear here when approved."
            icon={<Store className="h-10 w-10" />}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Most active shops</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/vendors">Browse all vendors</Link>
          </Button>
        </div>
        {activeVendors.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeVendors.map((vendor) => (
              <VendorCard key={vendor.slug} vendor={vendor} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No vendor activity yet"
            description="Vendors with active projects will show up here."
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent vendor launches</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/discover/ending-soon">Ending soon</Link>
          </Button>
        </div>
        {latestVendorProjects.length > 0 ? (
          <ProjectGrid projects={latestVendorProjects} />
        ) : (
          <EmptyState
            title="No vendor launches yet"
            description="Check back soon or explore community interest checks."
          >
            <Button asChild variant="outline">
              <Link href="/discover/interest-checks">See interest checks</Link>
            </Button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
