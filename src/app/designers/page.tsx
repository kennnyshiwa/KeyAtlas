import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { DesignerCard } from "@/components/designers/designer-card";
import { EmptyState } from "@/components/shared/empty-state";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Designers",
  description: "Browse keyboard designers and their projects.",
  alternates: { canonical: "/designers" },
};

export default async function DesignersPage() {
  const designers = await prisma.designer.findMany({
    select: {
      name: true,
      slug: true,
      logo: true,
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Designers"
        description="Browse keyboard designers and their projects."
      />

      {designers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designers.map((designer) => (
            <DesignerCard key={designer.slug} designer={designer} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No designers yet"
          description="Designer profiles will appear here once added."
        />
      )}
    </div>
  );
}
