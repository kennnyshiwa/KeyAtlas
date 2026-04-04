import Link from "next/link";
import { Palette, Store, CheckCircle } from "lucide-react";

interface MatchingDesigner {
  id: string;
  name: string;
  slug: string;
  _count: { projects: number };
}

interface MatchingVendor {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
  _count: { projects: number };
}

interface SearchResultsBarProps {
  matchingDesigners: MatchingDesigner[];
  matchingVendors: MatchingVendor[];
}

export function SearchResultsBar({ matchingDesigners, matchingVendors }: SearchResultsBarProps) {
  if (matchingDesigners.length === 0 && matchingVendors.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border p-4 space-y-3">
      <h2 className="text-sm font-semibold">Also matching your search</h2>
      <div className="flex flex-wrap gap-4">
        {matchingDesigners.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium flex items-center gap-1">
              <Palette className="h-4 w-4" />
              Designers
            </span>
            {matchingDesigners.map((designer) => (
              <Link
                key={designer.id}
                href={`/designers/${designer.slug}`}
                className="bg-card border rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              >
                <span className="font-medium">{designer.name}</span>
                <span className="text-muted-foreground text-xs">{designer._count.projects} projects</span>
              </Link>
            ))}
          </div>
        )}
        {matchingVendors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium flex items-center gap-1">
              <Store className="h-4 w-4" />
              Vendors
            </span>
            {matchingVendors.map((vendor) => (
              <Link
                key={vendor.id}
                href={`/vendors/${vendor.slug}`}
                className="bg-card border rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
              >
                <span className="font-medium">{vendor.name}</span>
                {vendor.verified && (
                  <CheckCircle className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                )}
                <span className="text-muted-foreground text-xs">{vendor._count.projects} projects</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
