"use client";

import { useState, useEffect } from "react";
import { ProjectGrid } from "./project-grid";
import { ViewModeToggle, type ViewMode } from "./view-mode-toggle";
import type { ProjectListItem } from "@/types";

interface ProjectViewWrapperProps {
  projects: ProjectListItem[];
}

const STORAGE_KEY = "keyatlas-view-mode";

export function ProjectViewWrapper({ projects }: ProjectViewWrapperProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (stored && ["card", "compact", "image", "masonry"].includes(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode(stored);
    }
  }, []);

  const handleChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewModeToggle value={viewMode} onChange={handleChange} />
      </div>
      <ProjectGrid projects={projects} viewMode={viewMode} />
    </div>
  );
}
