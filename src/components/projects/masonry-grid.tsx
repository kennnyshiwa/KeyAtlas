"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ProjectCard } from "./project-card";
import type { ProjectListItem } from "@/types";

import type { PreparedText } from "@/lib/pretext/layout";

interface PretextModule {
  prepare: (text: string, font: string) => PreparedText;
  layout: (
    prepared: PreparedText,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
}

interface MasonryGridProps {
  projects: ProjectListItem[];
}

/** Fixed card dimensions that don't depend on text measurement */
const IMAGE_ASPECT = 10 / 16; // aspect-[16/10] → height = width * 10/16
const CARD_PADDING_TOP = 12; // p-3 top
const CARD_PADDING_BOTTOM = 12; // p-3 bottom
const BADGES_HEIGHT = 24; // category/profile badges row
const TITLE_HEIGHT = 24; // h3 line
const DESIGNER_HEIGHT = 20; // "by designer" line
const PRICE_ROW_HEIGHT = 28; // price + favorite button
const GAP = 16; // gap-4
const VERTICAL_SPACING = 8; // mb-1, mb-2 margins between elements

/** Pretext font string matching Geist Sans at text-xs (12px) */
const DESCRIPTION_FONT = "12px Geist, sans-serif";
const DESCRIPTION_LINE_HEIGHT = 19.2; // text-xs leading-relaxed ≈ 1.6 * 12

function getColumnCount(width: number): number {
  if (width >= 1280) return 4; // xl
  if (width >= 1024) return 3; // lg
  if (width >= 640) return 2; // sm
  return 1;
}

export function MasonryGrid({ projects }: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<ProjectListItem[][]>([]);
  const [columnCount, setColumnCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const pretextRef = useRef<PretextModule | null>(null);

  // Load pretext dynamically (browser-only, needs canvas)
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    import("@/lib/pretext/layout").then((mod) => {
      if (!cancelled) {
        // Debug: log the actual module shape
        console.log("[Pretext] Module keys:", Object.keys(mod));
        console.log("[Pretext] typeof prepare:", typeof (mod as Record<string, unknown>).prepare);
        console.log("[Pretext] typeof default:", typeof (mod as Record<string, unknown>).default);
        
        // Handle ESM module shape - check for named exports first, then default
        const anyMod = mod as Record<string, unknown>;
        if (typeof anyMod.prepare === "function") {
          pretextRef.current = mod as unknown as PretextModule;
        } else if (anyMod.default && typeof (anyMod.default as Record<string, unknown>).prepare === "function") {
          pretextRef.current = anyMod.default as unknown as PretextModule;
        } else {
          console.warn("[Pretext] Module loaded but prepare() not found. Shape:", Object.keys(mod));
          return; // Don't trigger layout with broken module
        }
        layoutProjects();
      }
    }).catch((err) => {
      console.warn("[Pretext] Failed to load, falling back to CSS grid:", err);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layoutProjects = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.offsetWidth;
    const cols = getColumnCount(containerWidth);
    setColumnCount(cols);

    if (cols <= 1) {
      // Single column — no masonry needed
      setColumns([projects]);
      return;
    }

    const colWidth = (containerWidth - GAP * (cols - 1)) / cols;
    const imageHeight = colWidth * IMAGE_ASPECT;

    // Initialize column heights
    const colHeights = new Array(cols).fill(0);
    const colItems: ProjectListItem[][] = Array.from({ length: cols }, () => []);

    for (const project of projects) {
      // Estimate card height
      let cardHeight = imageHeight + CARD_PADDING_TOP + BADGES_HEIGHT + TITLE_HEIGHT + VERTICAL_SPACING;

      // Designer/vendor line
      if (project.designer || project.vendor) {
        cardHeight += DESIGNER_HEIGHT;
      }

      // Description preview height via pretext
      if (project.descriptionPreview && pretextRef.current && typeof pretextRef.current.prepare === "function") {
        try {
          const prepared = pretextRef.current.prepare(
            project.descriptionPreview,
            DESCRIPTION_FONT,
          );
          // Card content has p-3 (12px each side), so text width = colWidth - 24
          const textWidth = colWidth - 24;
          const { height: textHeight } = pretextRef.current.layout(
            prepared,
            textWidth,
            DESCRIPTION_LINE_HEIGHT,
          );
          // Clamp to 2 lines max (line-clamp-2)
          const maxDescHeight = DESCRIPTION_LINE_HEIGHT * 2;
          cardHeight += Math.min(textHeight, maxDescHeight) + 8; // + mb-2
        } catch {
          // Pretext measurement failed, use fallback height
          cardHeight += DESCRIPTION_LINE_HEIGHT * 2 + 8;
        }
      } else if (project.descriptionPreview) {
        // Fallback: estimate 2 lines for description
        cardHeight += DESCRIPTION_LINE_HEIGHT * 2 + 8;
      }

      cardHeight += PRICE_ROW_HEIGHT + CARD_PADDING_BOTTOM;

      // Place in shortest column
      let shortestCol = 0;
      for (let i = 1; i < cols; i++) {
        if (colHeights[i] < colHeights[shortestCol]) shortestCol = i;
      }

      colItems[shortestCol].push(project);
      colHeights[shortestCol] += cardHeight + GAP;
    }

    setColumns(colItems);
  }, [projects]);

  // Re-layout on mount, resize, and when projects change
  useEffect(() => {
    if (!mounted) return;
    layoutProjects();

    const observer = new ResizeObserver(() => {
      layoutProjects();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [mounted, layoutProjects]);

  // SSR fallback — regular grid
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    );
  }

  // Single column fallback
  if (columnCount <= 1) {
    return (
      <div ref={containerRef} className="grid grid-cols-1 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} fullHeight={false} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex gap-4"
      style={{ alignItems: "flex-start" }}
    >
      {columns.map((colProjects, colIdx) => (
        <div
          key={colIdx}
          className="flex flex-1 flex-col gap-4"
          style={{ minWidth: 0 }}
        >
          {colProjects.map((project) => (
            <ProjectCard key={project.id} project={project} fullHeight={false} />
          ))}
        </div>
      ))}
    </div>
  );
}
