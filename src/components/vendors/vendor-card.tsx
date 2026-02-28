import Link from "next/link";
import { SmartImage } from "@/components/shared/smart-image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, CheckCircle } from "lucide-react";

interface VendorCardProps {
  vendor: {
    name: string;
    slug: string;
    logo: string | null;
    regionsServed: string[];
    verified: boolean;
    _count: { projectVendors: number };
  };
}

export function VendorCard({ vendor }: VendorCardProps) {
  return (
    <Link href={`/vendors/${vendor.slug}`}>
      <Card className="group h-full transition-shadow hover:shadow-lg">
        <CardContent className="flex items-start gap-4 p-4">
          <div className="bg-muted flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            {vendor.logo ? (
              <SmartImage
                src={vendor.logo}
                alt={vendor.name}
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            ) : (
              <Store className="text-muted-foreground h-8 w-8" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="line-clamp-1 font-semibold">{vendor.name}</h3>
              {vendor.verified && (
                <CheckCircle className="h-4 w-4 shrink-0 text-blue-500" />
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {vendor._count.projectVendors} {vendor._count.projectVendors === 1 ? "project" : "projects"}
            </p>
            {vendor.regionsServed.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {vendor.regionsServed.map((region) => (
                  <Badge key={region} variant="secondary" className="text-xs">
                    {region}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
