import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildAuditLogWhere, parseAuditLogQueryParams } from "@/lib/admin-audit-log-filters";

const PAGE_SIZE = 50;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(params: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v) result.append(key, v);
      }
      continue;
    }

    if (value) {
      result.set(key, value);
    }
  }

  return result;
}

function withPage(searchParams: URLSearchParams, page: number) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("page", String(page));
  return `?${next.toString()}`;
}

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const urlSearchParams = toSearchParams(resolvedSearchParams);
  if (!urlSearchParams.get("limit")) {
    urlSearchParams.set("limit", String(PAGE_SIZE));
  }

  const parsed = parseAuditLogQueryParams(urlSearchParams);
  const offset = (parsed.page - 1) * parsed.limit;
  const where = buildAuditLogWhere(parsed);

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: parsed.limit,
      include: {
        actor: {
          select: { id: true, email: true, username: true, displayName: true, role: true },
        },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / parsed.limit));
  const exportHref = `/api/v1/admin/audit-logs/export?${urlSearchParams.toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Administrative and moderation actions across the platform"
      >
        <Button asChild variant="outline">
          <a href={exportHref}>Export CSV</a>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <form className="grid grid-cols-1 gap-3 md:grid-cols-6" method="get">
            <select
              name="actorRole"
              defaultValue={parsed.actorRole ?? ""}
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            >
              <option value="">All roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="VENDOR">VENDOR</option>
              <option value="USER">USER</option>
            </select>
            <Input name="action" placeholder="Action contains" defaultValue={parsed.action ?? ""} />
            <Input name="resource" placeholder="Resource" defaultValue={parsed.resource ?? ""} />
            <Input name="from" type="date" defaultValue={parsed.from ?? ""} />
            <Input name="to" type="date" defaultValue={parsed.to ?? ""} />
            <input type="hidden" name="limit" value={String(parsed.limit)} />
            <div className="md:col-span-6 flex flex-wrap gap-2">
              <Button type="submit">Apply filters</Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/admin/audit-logs">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="text-muted-foreground text-sm">
        Showing {logs.length} of {total} matching audit logs.
      </div>

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

        {logs.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No audit logs match the current filters.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button asChild variant="outline" disabled={parsed.page <= 1}>
          <Link href={withPage(urlSearchParams, Math.max(1, parsed.page - 1))}>Previous</Link>
        </Button>
        <span className="text-muted-foreground text-sm">
          Page {parsed.page} of {totalPages}
        </span>
        <Button asChild variant="outline" disabled={parsed.page >= totalPages}>
          <Link href={withPage(urlSearchParams, Math.min(totalPages, parsed.page + 1))}>Next</Link>
        </Button>
      </div>
    </div>
  );
}
