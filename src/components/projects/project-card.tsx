import Link from "next/link";
import { SmartImage } from "@/components/shared/smart-image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "./status-badge";
import { FavoriteButton } from "./favorite-button";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

interface ProjectCardProps {
  project: ProjectListItem;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const href = project.published === false
    ? `/projects/submit/${project.id}/edit`
    : `/projects/${project.slug}`;

  return (
    <Link href={href} className="h-full">
      <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
        <div className="relative aspect-[16/10] overflow-hidden">
          {project.heroImage ? (
            <SmartImage
              src={project.heroImage}
              alt={project.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="bg-muted flex h-full items-center justify-center">
              <span className="text-muted-foreground text-sm">No image</span>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            <ProjectStatusBadge status={project.status} />
          </div>
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {project.published === false && (
              <Badge className="bg-amber-500 text-white">
                Pending Review
              </Badge>
            )}
            {project.featured && (
              <Badge className="bg-yellow-500 text-white">
                Featured
              </Badge>
            )}
          </div>
        </div>
        <CardContent className="flex flex-1 flex-col p-3">
          <div className="mb-1 flex items-center gap-2">
            <Badge className={`text-xs ${CATEGORY_COLORS[project.category]}`}>
              {CATEGORY_LABELS[project.category]}
            </Badge>
            {project.profile && (
              <Badge variant="outline" className="text-xs">
                {project.profile}
              </Badge>
            )}
            {project.shipped && (
              <Badge className="bg-emerald-500 text-xs text-white">
                Shipped
              </Badge>
            )}
          </div>
          <h3 className="mb-1 line-clamp-1 font-semibold">{project.title}</h3>
          {(project.designer || project.vendor) && (
            <p className="text-muted-foreground mb-2 text-sm">
              {project.designer ? `by ${project.designer}` : `by ${project.vendor!.name}`}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between">
            {project.priceMin != null && (
              <span className="text-sm font-medium">
                {formatPrice(project.priceMin, project.currency)}
                {project.priceMax != null &&
                  project.priceMax !== project.priceMin &&
                  ` - ${formatPrice(project.priceMax, project.currency)}`}
              </span>
            )}
            <FavoriteButton projectId={project.id} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
