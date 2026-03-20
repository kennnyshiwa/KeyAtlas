import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DesignerForm } from "@/components/designers/designer-form";
import { PageHeader } from "@/components/shared/page-header";

interface EditDesignerPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Edit Designer",
};

export default async function EditDesignerPage({ params }: EditDesignerPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { slug } = await params;
  const designer = await prisma.designer.findUnique({
    where: { slug },
    include: { owner: { select: { username: true, name: true } } },
  });

  if (!designer) notFound();

  const isAdmin = ["ADMIN", "MODERATOR"].includes(session.user.role);
  const isOwner = designer.ownerId === session.user.id;

  if (!isAdmin && !isOwner) {
    redirect(`/designers/${slug}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${designer.name}`} />
      <DesignerForm designer={designer} isAdmin={isAdmin} />
    </div>
  );
}
