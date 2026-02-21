import Link from "next/link";
import { SmartImage } from "@/components/shared/smart-image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { differenceInDays, differenceInHours } from "date-fns";
import type { ProjectListItem } from "@/types";

interface EndingSoonCardProps {
  project: ProjectListItem;
}

export function EndingSoonCard({ project }: EndingSoonCardProps) {
  const now = new Date();
  const endDate = project.gbEndDate ? new Date(project.gbEndDate) : null;
  const daysLeft = endDate ? differenceInDays(endDate, now) : null;
  const hoursLeft = endDate ? differenceInHours(endDate, now) : null;

  const urgencyLabel =
    daysLeft === null
      ? null
      : daysLeft <= 0
        ? "Ending today"
        : daysLeft === 1
          ? "1 day left"
          : daysLeft <= 3
            ? `${daysLeft} days left`
            : `${daysLeft} days left`;

  const urgencyColor =
    daysLeft === null
      ? ""
      : daysLeft <= 1
        ? "bg-red-500 text-white"
        : daysLeft <= 3
          ? "bg-orange-500 text-white"
          : "bg-amber-500 text-white";

  return (
    <Link href={`/projects/${project.slug}`}>
      <Card className="group flex h-full flex-row overflow-hidden transition-shadow hover:shadow-lg">
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden sm:h-28 sm:w-28">
          {project.heroImage ? (
            <SmartImage
              src={project.heroImage}
              alt={project.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="112px"
            />
          ) : (
            <div className="bg-muted flex h-full w-full items-center justify-center">
              <span className="text-muted-foreground text-xs">No img</span>
            </div>
          )}
        </div>
        <CardContent className="flex flex-1 flex-col justify-center gap-1 p-3">
          <div className="flex items-center gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold">{project.title}</h3>
            {urgencyLabel && (
              <Badge className={`flex-shrink-0 text-xs ${urgencyColor}`}>
                <Clock className="mr-1 h-3 w-3" />
                {urgencyLabel}
              </Badge>
            )}
          </div>
          {project.vendor && (
            <p className="text-muted-foreground text-xs">{project.vendor.name}</p>
          )}
          {project.priceMin != null && (
            <span className="text-xs font-medium">
              {formatPrice(project.priceMin, project.currency)}
              {project.priceMax != null &&
                project.priceMax !== project.priceMin &&
                ` – ${formatPrice(project.priceMax, project.currency)}`}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
