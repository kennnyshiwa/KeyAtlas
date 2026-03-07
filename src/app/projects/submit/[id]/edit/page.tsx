import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { REQUIRE_PROJECT_REVIEW } from "@/lib/feature-flags";

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
        soundTests: { orderBy: { createdAt: "asc" } },
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

  // Creator, admin, or moderator can edit.
  // If review is required, lock published projects; otherwise allow editing published projects.
  const isCreatorOrStaff =
    project.creatorId === session.user.id ||
    session.user.role === "ADMIN" ||
    session.user.role === "MODERATOR";
  if (!isCreatorOrStaff) {
    redirect("/profile");
  }
  if (REQUIRE_PROJECT_REVIEW && project.published) {
    redirect("/profile");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Project"
        description="Update your project details."
      />
      <ProjectForm project={project} mode="submit" vendors={vendors} />
    </div>
  );
}
