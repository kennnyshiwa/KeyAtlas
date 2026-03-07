import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { GuideForm } from "@/components/guides/guide-form";

export const metadata = {
  title: "Edit Guide",
};

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EditGuidePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { slug } = await params;

  const guide = await prisma.buildGuide.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      content: true,
      difficulty: true,
      heroImage: true,
      authorId: true,
    },
  });

  if (!guide) notFound();

  const isOwner = guide.authorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    redirect(`/guides/${slug}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Edit Guide"
        description="Update your guide content."
      />
      <GuideForm
        mode="edit"
        initialData={{
          id: guide.id,
          title: guide.title,
          content: guide.content,
          difficulty: guide.difficulty,
          heroImage: guide.heroImage,
        }}
      />
    </div>
  );
}
