import Link from "next/link";
import { SmartImage } from "@/components/shared/smart-image";
import { Card, CardContent } from "@/components/ui/card";
import { Palette } from "lucide-react";

interface DesignerCardProps {
  designer: {
    name: string;
    slug: string;
    logo: string | null;
    _count: { projects: number };
  };
}

export function DesignerCard({ designer }: DesignerCardProps) {
  return (
    <Link href={`/designers/${designer.slug}`}>
      <Card className="group h-full transition-shadow hover:shadow-lg">
        <CardContent className="flex items-start gap-4 p-4">
          <div className="bg-muted flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            {designer.logo ? (
              <SmartImage
                src={designer.logo}
                alt={designer.name}
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            ) : (
              <Palette className="text-muted-foreground h-8 w-8" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 font-semibold">{designer.name}</h3>
            <p className="text-muted-foreground text-sm">
              {designer._count.projects} {designer._count.projects === 1 ? "project" : "projects"}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
