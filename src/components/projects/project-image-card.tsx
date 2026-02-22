import Link from "next/link";
import Image from "next/image";
import { ProjectStatusBadge } from "./status-badge";
import type { ProjectListItem } from "@/types";

interface ProjectImageCardProps {
  project: ProjectListItem;
}

export function ProjectImageCard({ project }: ProjectImageCardProps) {
  const href = project.published === false
    ? `/projects/submit/${project.id}/edit`
    : `/projects/${project.slug}`;

  return (
    <Link href={href} className="group relative overflow-hidden rounded-lg">
      <div className="relative aspect-[3/4]">
        {project.heroImage ? (
          <Image
            src={project.heroImage}
            alt={project.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />
        ) : (
          <div className="bg-muted flex h-full items-center justify-center">
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute top-2 left-2">
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="line-clamp-2 font-semibold text-white">
            {project.title}
          </h3>
          {(project.designer || project.vendor) && (
            <p className="mt-1 text-xs text-white/80">by {project.designer || project.vendor?.name}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
