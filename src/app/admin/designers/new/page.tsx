import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DesignerForm } from "@/components/designers/designer-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Add Designer",
};

export default async function NewDesignerPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add Designer" />
      <DesignerForm />
    </div>
  );
}
