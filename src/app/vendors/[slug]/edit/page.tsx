import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VendorForm } from "@/components/vendors/vendor-form";
import { PageHeader } from "@/components/shared/page-header";

interface EditVendorPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Edit Vendor",
};

export default async function EditVendorPage({ params }: EditVendorPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { slug } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { slug },
    include: { owner: { select: { username: true, name: true } } },
  });

  if (!vendor) notFound();

  const isAdmin = ["ADMIN", "MODERATOR"].includes(session.user.role);
  const isOwner = vendor.ownerId === session.user.id;

  if (!isAdmin && !isOwner) {
    redirect(`/vendors/${slug}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${vendor.name}`} />
      <VendorForm vendor={vendor} isAdmin={isAdmin} />
    </div>
  );
}
