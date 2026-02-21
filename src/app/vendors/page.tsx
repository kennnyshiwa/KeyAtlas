import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { VendorCard } from "@/components/vendors/vendor-card";
import { EmptyState } from "@/components/shared/empty-state";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendors",
  description: "Browse keyboard vendors and their projects.",
  alternates: { canonical: "/vendors" },
};

export default async function VendorsPage() {
  const vendors = await prisma.vendor.findMany({
    select: {
      name: true,
      slug: true,
      logo: true,
      regionsServed: true,
      verified: true,
      _count: { select: { projectVendors: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Browse keyboard vendors and their projects."
      />

      {vendors.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.slug} vendor={vendor} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No vendors yet"
          description="Vendors will appear here once added."
        />
      )}
    </div>
  );
}
