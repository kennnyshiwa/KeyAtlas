import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

interface ProjectVendor {
  id: string;
  region: string | null;
  storeLink: string | null;
  endDate: Date | null;
  vendor: {
    name: string;
    slug: string;
  };
}

interface ProjectVendorsDisplayProps {
  projectVendors: ProjectVendor[];
}

export function ProjectVendorsDisplay({
  projectVendors,
}: ProjectVendorsDisplayProps) {
  if (projectVendors.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Vendors</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Store</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projectVendors.map((pv) => (
            <TableRow key={pv.id}>
              <TableCell className="font-medium">{pv.vendor.name}</TableCell>
              <TableCell>{pv.region ?? "—"}</TableCell>
              <TableCell>
                {pv.endDate ? formatDate(pv.endDate) : "—"}
              </TableCell>
              <TableCell>
                {pv.storeLink ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={pv.storeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
