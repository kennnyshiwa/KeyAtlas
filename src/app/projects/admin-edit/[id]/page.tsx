import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Admin Edit Project",
  description: "Edit any project as admin.",
};

interface AdminEditProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditProjectPage({ params }: AdminEditProjectPageProps) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const { id } = await params;

  const [project, vendors] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: "asc" } },
        links: true,
        vendor: true,
        creator: { select: { id: true, name: true, image: true } },
        projectVendors: true,
      },
    }),
    prisma.vendor.findMany({
      select: { id: true, name: true, regionsServed: true, storefrontUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Project" description={`Admin editing "${project.title}"`} />
      <ProjectForm project={project} mode="admin" showSectionNav vendors={vendors} />
    </div>
  );
}
