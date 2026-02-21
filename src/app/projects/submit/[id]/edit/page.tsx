import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Edit Submission",
  description: "Edit your project submission.",
};

interface EditSubmissionPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSubmissionPage({ params }: EditSubmissionPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
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
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) {
    notFound();
  }

  // Only the creator can edit, and only if unpublished
  if (project.creatorId !== session.user.id || project.published) {
    redirect("/profile");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Submission"
        description="Update your project submission before it's reviewed."
      />
      <ProjectForm project={project} mode="submit" vendors={vendors} />
    </div>
  );
}
