import { SmartImage } from "@/components/shared/smart-image";
import { ProjectStatusBadge } from "./status-badge";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { ProjectWithRelations } from "@/types";

interface ProjectHeroProps {
  project: ProjectWithRelations;
}

export function ProjectHero({ project }: ProjectHeroProps) {
  return (
    <div className="space-y-4">
      {project.heroImage && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
          <SmartImage
            src={project.heroImage}
            alt={project.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 1200px) 100vw, 1200px"
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
