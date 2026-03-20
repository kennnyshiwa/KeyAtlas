import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DesignerForm } from "@/components/designers/designer-form";
import { PageHeader } from "@/components/shared/page-header";

interface EditDesignerPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Edit Designer",
};

export default async function EditDesignerPage({ params }: EditDesignerPageProps) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const { id } = await params;
  const designer = await prisma.designer.findUnique({
    where: { id },
    include: { owner: { select: { username: true, name: true } } },
  });

  if (!designer) notFound();

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit Designer" />
      <DesignerForm designer={designer} isAdmin={isAdmin} />
    </div>
  );
}
