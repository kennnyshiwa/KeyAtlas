import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminAuditLogsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      actor: {
        select: { id: true, email: true, username: true, displayName: true, role: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Administrative and moderation actions across the platform"
      />

      <div className="space-y-3">
        {logs.map((log) => (
          <Card key={log.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{log.actorRole}</Badge>
                <Badge>{log.action}</Badge>
                <span className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>

              <div>
                <span className="font-medium">Actor:</span>{" "}
                {log.actor.displayName || log.actor.username || log.actor.email || log.actor.id}
              </div>

              <div>
                <span className="font-medium">Resource:</span> {log.resource}
                {log.resourceId ? ` (${log.resourceId})` : ""}
                {log.targetId ? ` → target: ${log.targetId}` : ""}
              </div>

              {log.metadata && (
                <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
