import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { NewGuideForm } from "@/components/guides/new-guide-form";

export const metadata = {
  title: "Write a Build Guide",
};

export default async function NewGuidePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Write a Build Guide"
        description="Share your keyboard building knowledge with the community."
      />
      <NewGuideForm />
    </div>
  );
}
