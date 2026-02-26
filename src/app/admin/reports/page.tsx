import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "./report-actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const reports = await prisma.projectReport.findMany({
    include: {
      project: { select: { id: true, title: true, slug: true } },
      reporter: { select: { id: true, name: true, username: true } },
      resolvedBy: { select: { id: true, name: true, username: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const statusColor: Record<string, string> = {
    OPEN: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    NON_ISSUE: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      {reports.length === 0 && (
        <p className="text-muted-foreground">No reports yet.</p>
      )}

      <div className="space-y-4">
        {reports.map((report) => (
          <div
            key={report.id}
            className="bg-card rounded-lg border p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className={statusColor[report.status]}>
                    {report.status.replace("_", " ")}
                  </Badge>
                  <Link
                    href={`/projects/${report.project?.slug}`}
                    className="font-medium hover:underline"
                  >
                    {report.project?.title ?? "Deleted project"}
                  </Link>
                </div>
                <p className="text-sm">{report.reason}</p>
                <p className="text-muted-foreground text-xs">
                  Reported by {report.reporter?.name || report.reporter?.username || "Unknown"} &middot;{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </p>
                {report.resolvedBy && (
                  <p className="text-muted-foreground text-xs">
                    Resolved by {report.resolvedBy.name || report.resolvedBy.username} &middot;{" "}
                    {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : ""}
                    {report.resolutionNote && ` — ${report.resolutionNote}`}
                  </p>
                )}
              </div>
              {report.status === "OPEN" && (
                <ReportActions reportId={report.id} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
