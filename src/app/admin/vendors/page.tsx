import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, CheckCircle, Trash2 } from "lucide-react";
import { VendorDeleteButton } from "@/components/admin/vendor-delete-button";
import { VendorMergeDialog } from "@/components/admin/vendor-merge-dialog";

export const metadata = {
  title: "Manage Vendors",
};

export default async function AdminVendorsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/");
  }

  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { projects: true, projectVendors: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Manage Vendors">
        <div className="flex gap-2">
          <VendorMergeDialog vendors={vendors} />
          <Button asChild>
            <Link href="/admin/vendors/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Vendor
            </Link>
          </Button>
        </div>
      </PageHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Regions</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell className="font-medium">{vendor.name}</TableCell>
              <TableCell>{vendor.slug}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {vendor.regionsServed.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">
                      {r}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{vendor._count.projects + vendor._count.projectVendors}</TableCell>
              <TableCell>
                {vendor.verified && (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/vendors/${vendor.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <VendorDeleteButton vendorId={vendor.id} vendorName={vendor.name} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
