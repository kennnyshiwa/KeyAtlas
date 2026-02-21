import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { NewThreadForm } from "@/components/forums/new-thread-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewThreadPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { slug } = await params;
  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!category) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`New Thread in ${category.name}`}
        description="Start a new discussion."
      />
      <NewThreadForm categoryId={category.id} categorySlug={category.slug} />
    </div>
  );
}
