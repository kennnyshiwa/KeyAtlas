import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectOwnershipTransfer } from "@/components/projects/project-ownership-transfer";

export const metadata = {
  title: "Edit Project",
};

interface EditProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = await params;

  const [project, vendors] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: "asc" } },
        links: true,
        vendor: true,
        creator: { select: { id: true, name: true, email: true, username: true, displayName: true, image: true } },
        projectVendors: true,
      },
    }),
    prisma.vendor.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Edit Project"
        description={`Editing "${project.title}"`}
      />
      <ProjectOwnershipTransfer
        projectId={project.id}
        currentOwner={{
          id: project.creator.id,
          name: project.creator.name,
          email: project.creator.email,
          username: project.creator.username,
          displayName: project.creator.displayName,
        }}
      />
      <ProjectForm project={project} vendors={vendors} />
    </div>
  );
}
