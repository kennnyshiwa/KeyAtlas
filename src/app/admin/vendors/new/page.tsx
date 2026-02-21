import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { VendorForm } from "@/components/vendors/vendor-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Add Vendor",
};

export default async function NewVendorPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add Vendor" />
      <VendorForm />
    </div>
  );
}
