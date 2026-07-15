import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { sortByNameCaseInsensitive } from "@/lib/sort-by-name";

export const metadata = {
  title: "New Project",
};

export default async function NewProjectPage() {
  const vendors = sortByNameCaseInsensitive(await prisma.vendor.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New Project"
        description="Create a new project listing."
      />
      <ProjectForm vendors={vendors} />
    </div>
  );
}
