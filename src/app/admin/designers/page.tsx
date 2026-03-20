import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { DesignerDeleteButton } from "@/components/admin/designer-delete-button";
import { DesignerMergeDialog } from "@/components/admin/designer-merge-dialog";

export const metadata = {
  title: "Manage Designers",
};

export default async function AdminDesignersPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const designers = await prisma.designer.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Manage Designers">
        <div className="flex gap-2">
          <DesignerMergeDialog designers={designers} />
          <Button asChild>
            <Link href="/admin/designers/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Designer
            </Link>
          </Button>
        </div>
      </PageHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {designers.map((designer) => (
            <TableRow key={designer.id}>
              <TableCell className="font-medium">{designer.name}</TableCell>
              <TableCell>{designer.slug}</TableCell>
              <TableCell>{designer._count.projects}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/designers/${designer.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <DesignerDeleteButton designerId={designer.id} designerName={designer.name} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
