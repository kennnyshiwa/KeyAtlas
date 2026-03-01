import { SmartImage } from "@/components/shared/smart-image";
import { ProjectStatusBadge } from "./status-badge";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";
import { formatPrice, formatDate } from "@/lib/utils";
import { Calendar, Truck } from "lucide-react";
import type { ProjectWithRelations } from "@/types";

interface ProjectHeroProps {
  project: ProjectWithRelations;
}

export function ProjectHero({ project }: ProjectHeroProps) {
  return (
    <div className="space-y-4">
      {project.heroImage && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
          <SmartImage
            src={project.heroImage}
            alt={project.title}
            fill
            className="object-contain"
            priority
            quality={90}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 1200px"
          />
        </div>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.status} />
          <Badge className={CATEGORY_COLORS[project.category]}>{CATEGORY_LABELS[project.category]}</Badge>
          {project.profile && (
            <Badge variant="outline">{project.profile}</Badge>
          )}
          {project.shipped && (
            <Badge className="bg-emerald-500 text-white">Shipped</Badge>
          )}
          {project.featured && (
            <Badge className="bg-yellow-500 text-white">Featured</Badge>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
        {(project.designer || project.vendor) && (
          <p className="text-muted-foreground text-lg">
            by {project.designer || project.vendor?.name}
          </p>
        )}
        {project.priceMin != null && (
          <p className="text-xl font-semibold">
            {formatPrice(project.priceMin, project.currency)}
            {project.priceMax != null &&
              project.priceMax !== project.priceMin &&
              ` - ${formatPrice(project.priceMax, project.currency)}`}
          </p>
        )}
        {project.status === "COMPLETED" || project.status === "SHIPPING" || project.status === "PRODUCTION" ? (
          project.estimatedDelivery && (
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Truck className="h-4 w-4" />
              <span>Estimated Delivery: <span className="font-medium text-foreground">{project.estimatedDelivery}</span></span>
            </div>
          )
        ) : (
          (project.gbStartDate || project.gbEndDate) && (
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4" />
              <span>
                {project.gbStartDate && project.gbEndDate
                  ? `Group Buy: ${formatDate(project.gbStartDate)} — ${formatDate(project.gbEndDate)}`
                  : project.gbStartDate
                    ? `Group Buy starts: ${formatDate(project.gbStartDate)}`
                    : `Group Buy ends: ${formatDate(project.gbEndDate!)}`}
              </span>
            </div>
          )
        )}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
