import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { UserRole } from "@/generated/prisma/client";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/admin");
  }
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const role = params.role && Object.values(UserRole).includes(params.role as UserRole)
    ? (params.role as UserRole)
    : undefined;
  const status = params.status === "banned" || params.status === "active" ? params.status : undefined;
  const page = Math.max(1, Number(params.page || "1") || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
    ...(status === "banned" ? { bannedAt: { not: null } } : {}),
    ...(status === "active" ? { bannedAt: null } : {}),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
        emailVerified: true,
        bannedAt: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevQuery = new URLSearchParams({ q, role: role ?? "", status: status ?? "", page: String(Math.max(1, page - 1)) }).toString();
  const nextQuery = new URLSearchParams({ q, role: role ?? "", status: status ?? "", page: String(Math.min(totalPages, page + 1)) }).toString();

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage user accounts, access, and account status." />

      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-4" method="GET">
        <Input name="q" placeholder="Search email or name" defaultValue={q} />
        <select name="role" defaultValue={role ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">All roles</option>
          <option value="USER">USER</option>
          <option value="MODERATOR">MODERATOR</option>
          <option value="ADMIN">ADMIN</option>
          <option value="VENDOR">VENDOR</option>
        </select>
        <select name="status" defaultValue={status ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
        <Button type="submit">Apply filters</Button>
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email verified</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    {user.displayName || user.name || user.email || user.id}
                  </Link>
                  <div className="text-muted-foreground text-xs">{user.email || "No email"}</div>
                </TableCell>
                <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                <TableCell>{user.emailVerified ? "Yes" : "No"}</TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell>{user.lastSeenAt ? formatDate(user.lastSeenAt) : "—"}</TableCell>
                <TableCell>
                  {user.bannedAt ? <Badge variant="destructive">Banned</Badge> : <Badge>Active</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">{total} users total</p>
        <div className="flex gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/users?${prevQuery}`}>Previous</Link>
            </Button>
          )}
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/users?${nextQuery}`}>Next</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
