import { ProjectCard } from "./project-card";
import { ProjectCompactRow } from "./project-compact-row";
import { ProjectImageCard } from "./project-image-card";
import type { ViewMode } from "./view-mode-toggle";
import type { ProjectListItem } from "@/types";

interface ProjectGridProps {
  projects: ProjectListItem[];
  viewMode?: ViewMode;
}

export function ProjectGrid({ projects, viewMode = "card" }: ProjectGridProps) {
  if (viewMode === "compact") {
    return (
      <div className="space-y-2">
        {projects.map((project) => (
          <ProjectCompactRow key={project.id} project={project} />
        ))}
      </div>
    );
  }

  if (viewMode === "image") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {projects.map((project) => (
          <ProjectImageCard key={project.id} project={project} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
