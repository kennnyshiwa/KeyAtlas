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

  const vendors = await prisma.vendor.findMany({
    select: { id: true, name: true, regionsServed: true, storefrontUrl: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit a Project"
        description="Submit a keyboard project for the community. It will be reviewed before publishing."
      />
      <ProjectForm mode="submit" vendors={vendors} />
    </div>
  );
}
