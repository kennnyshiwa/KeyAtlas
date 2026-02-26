import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listKeycapProfiles } from "@/lib/keycap-profiles";
import { KeycapProfilesManager } from "@/components/admin/keycap-profiles-manager";

export default async function AdminKeycapProfilesPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const profiles = await listKeycapProfiles();

  return (
    <div className="space-y-6">
      <PageHeader title="Keycap Profiles" description="Manage available keycap profile options." />

      <Card>
        <CardHeader>
          <CardTitle>Profile Options</CardTitle>
        </CardHeader>
        <CardContent>
          <KeycapProfilesManager initialProfiles={profiles} />
        </CardContent>
      </Card>
    </div>
  );
}
