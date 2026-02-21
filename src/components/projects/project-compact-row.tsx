import Link from "next/link";
import { ProjectStatusBadge } from "./status-badge";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";
import { formatPrice, formatDate } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import type { ProjectListItem } from "@/types";

interface ProjectCompactRowProps {
  project: ProjectListItem;
}

export function ProjectCompactRow({ project }: ProjectCompactRowProps) {
  const href = project.published === false
    ? `/projects/submit/${project.id}/edit`
    : `/projects/${project.slug}`;

  return (
    <Link
      href={href}
      className="hover:bg-muted/50 flex items-center gap-3 rounded-md border p-3 transition-colors"
    >
      <ProjectStatusBadge status={project.status} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {project.title}
      </span>
      <span className={`hidden rounded-md px-2 py-0.5 text-xs font-medium sm:inline ${CATEGORY_COLORS[project.category]}`}>
        {CATEGORY_LABELS[project.category]}
      </span>
      {project.vendor && (
        <span className="text-muted-foreground hidden text-sm md:inline">
          {project.vendor.name}
        </span>
      )}
      {project.priceMin != null && (
        <span className="text-sm font-medium">
          {formatPrice(project.priceMin, project.currency)}
        </span>
      )}
      <span className="text-muted-foreground hidden text-xs lg:inline">
        {formatDate(project.createdAt)}
      </span>
      <FavoriteButton projectId={project.id} />
    </Link>
  );
}
