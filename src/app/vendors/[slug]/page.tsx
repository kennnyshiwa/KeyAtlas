import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Store, CheckCircle, ExternalLink } from "lucide-react";
import type { Metadata } from "next";

interface VendorPageProps {
  params: Promise<{ slug: string }>;
}

async function getVendor(slug: string) {
  return prisma.vendor.findUnique({
    where: { slug },
    include: {
      projectVendors: {
        include: {
          project: {
            include: {
              vendor: { select: { name: true, slug: true } },
              _count: { select: { favorites: true } },
            },
          },
        },
        orderBy: { project: { createdAt: "desc" } },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: VendorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendor(slug);

  if (!vendor) return { title: "Not Found" };

  return {
    title: vendor.name,
    description: vendor.description ?? `${vendor.name} on KeyVault`,
  };
}

export default async function VendorPage({ params }: VendorPageProps) {
  const { slug } = await params;
  const vendor = await getVendor(slug);

  if (!vendor) {
    notFound();
  }

  const publishedProjects = vendor.projectVendors
    .map((pv) => pv.project)
    .filter((p) => p.published);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-start gap-6">
        <div className="bg-muted flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {vendor.logo ? (
            <Image
              src={vendor.logo}
              alt={vendor.name}
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          ) : (
            <Store className="text-muted-foreground h-8 w-8" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{vendor.name}</h1>
            {vendor.verified && (
              <CheckCircle className="h-5 w-5 text-blue-500" />
            )}
          </div>
          {vendor.description && (
            <p className="text-muted-foreground mt-1">{vendor.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {vendor.regionsServed.map((region) => (
              <Badge key={region} variant="secondary">
                {region}
              </Badge>
            ))}
            {vendor.storefrontUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={vendor.storefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Visit Store
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Projects ({publishedProjects.length})
        </h2>
        {publishedProjects.length > 0 ? (
          <ProjectGrid projects={publishedProjects} />
        ) : (
          <EmptyState
            title="No projects yet"
            description="This vendor doesn't have any published projects yet."
          />
        )}
      </div>
    </div>
  );
}
