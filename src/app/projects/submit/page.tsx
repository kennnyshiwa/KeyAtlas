import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Submit a Project",
  description: "Submit a keyboard project for review.",
};

export default async function SubmitProjectPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [vendors, templateProjects] = await Promise.all([
    prisma.vendor.findMany({
      select: { id: true, name: true, regionsServed: true, storefrontUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { creatorId: session.user.id },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        description: true,
        tags: true,
        designer: true,
        profile: true,
        currency: true,
        priceMin: true,
        priceMax: true,
        estimatedDelivery: true,
        images: { select: { url: true, alt: true, order: true, linkUrl: true, openInNewTab: true }, orderBy: { order: "asc" } },
        links: { select: { label: true, url: true, type: true } },
        projectVendors: { select: { vendorId: true, region: true, storeLink: true, endDate: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit a Project"
        description="Submit a keyboard project for the community. It will be reviewed before publishing."
      />
      <ProjectForm mode="submit" vendors={vendors} templateProjects={templateProjects} />
    </div>
  );
}
