import { ProjectCard } from "./project-card";
import { ProjectCompactRow } from "./project-compact-row";
import { ProjectImageCard } from "./project-image-card";
import { MasonryGrid } from "./masonry-grid";
import { generateDescriptionPreview } from "@/lib/description-preview";
import type { ViewMode } from "./view-mode-toggle";
import type { ProjectListItem } from "@/types";

interface ProjectGridProps {
  projects: ProjectListItem[];
  viewMode?: ViewMode;
}

/**
 * Enrich projects with descriptionPreview if they have a raw `description`
 * from Prisma but haven't been mapped yet.
 */
function enrichWithPreviews(projects: ProjectListItem[]): ProjectListItem[] {
  return projects.map((p) => {
    if (p.descriptionPreview !== undefined) return p;
    // Prisma include queries return all fields; description may be on the raw object
    const raw = p as ProjectListItem & { description?: string | null };
    if (raw.description) {
      return { ...p, descriptionPreview: generateDescriptionPreview(raw.description) };
    }
    return p;
  });
}

export function ProjectGrid({ projects, viewMode = "card" }: ProjectGridProps) {
  const enriched = enrichWithPreviews(projects);
  if (viewMode === "compact") {
    return (
      <div className="space-y-2">
        {enriched.map((project) => (
          <ProjectCompactRow key={project.id} project={project} />
        ))}
      </div>
    );
  }

  if (viewMode === "image") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {enriched.map((project) => (
          <ProjectImageCard key={project.id} project={project} />
        ))}
      </div>
    );
  }

  if (viewMode === "masonry") {
    return <MasonryGrid projects={enriched} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {enriched.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
