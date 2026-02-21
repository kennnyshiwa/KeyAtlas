import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VendorForm } from "@/components/vendors/vendor-form";
import { PageHeader } from "@/components/shared/page-header";

interface EditVendorPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Edit Vendor",
};

export default async function EditVendorPage({ params }: EditVendorPageProps) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id } });

  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit Vendor" />
      <VendorForm vendor={vendor} />
    </div>
  );
}
