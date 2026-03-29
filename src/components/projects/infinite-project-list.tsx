"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ProjectGrid } from "./project-grid";
import { ViewModeToggle, type ViewMode } from "./view-mode-toggle";
import { Loader2 } from "lucide-react";
import type { ProjectListItem } from "@/types";

interface InfiniteProjectListProps {
  /** First page of projects (SSR) */
  initialProjects: ProjectListItem[];
  /** Total number of matching projects */
  total: number;
  /** Number of items per page */
  pageSize: number;
  /** Current search params (for building API URLs) */
  searchParams: Record<string, string | undefined>;
}

const STORAGE_KEY = "keyatlas-view-mode";

/**
 * Map a project returned by the /api/v1/projects endpoint into the
 * shape that the client-side ProjectGrid / ProjectCard components expect
 * (i.e. `ProjectListItem`).
 */
function mapApiProject(raw: Record<string, unknown>): ProjectListItem {
  const pricing = raw.pricing as Record<string, unknown> | null;
  return {
    id: raw.id as string,
    title: raw.title as string,
    slug: raw.slug as string,
    category: raw.category as ProjectListItem["category"],
    status: raw.status as ProjectListItem["status"],
    priceMin: (pricing?.min_price as number) ?? null,
    priceMax: (pricing?.max_price as number) ?? null,
    currency: (pricing?.currency as string) ?? null,
    heroImage: (raw.hero_image_url as string) ?? null,
    tags: (raw.tags as string[]) ?? [],
    featured: (raw.is_featured as boolean) ?? false,
    published: true,
    profile: (raw.profile as string) ?? null,
    designer: (raw.designer as string) ?? null,
    shipped: (raw.shipped as boolean) ?? false,
    createdAt: new Date(raw.created_at as string),
    updatedAt: new Date(raw.updated_at as string),
    gbStartDate: raw.gb_start_date ? new Date(raw.gb_start_date as string) : null,
    gbEndDate: raw.gb_end_date ? new Date(raw.gb_end_date as string) : null,
    vendor: raw.vendors && (raw.vendors as unknown[]).length > 0
      ? {
          name: ((raw.vendors as Record<string, unknown>[])[0]?.vendor as Record<string, unknown>)?.name as string ?? "",
          slug: ((raw.vendors as Record<string, unknown>[])[0]?.vendor as Record<string, unknown>)?.slug as string ?? "",
        }
      : null,
    _count: {
      favorites: (raw.favorite_count as number) ?? 0,
    },
  };
}

export function InfiniteProjectList({
  initialProjects,
  total,
  pageSize,
  searchParams,
}: InfiniteProjectListProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>(initialProjects);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialProjects.length < total);
  const [isLoading, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  // Reset when initialProjects change (filters/sort changed)
  useEffect(() => {
    setProjects(initialProjects);
    setPage(1);
    setHasMore(initialProjects.length < total);
  }, [initialProjects, total]);

  // Restore view mode from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (stored && ["card", "compact", "image", "masonry"].includes(stored)) {
      setViewMode(stored);
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return;
    setIsFetching(true);

    const nextPage = page + 1;
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("limit", String(pageSize));

    // Forward all search/filter params
    if (searchParams.category) params.set("category", searchParams.category);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.featured) params.set("featured", searchParams.featured);
    if (searchParams.profile) params.set("profile", searchParams.profile);
    if (searchParams.designer) params.set("designer", searchParams.designer);
    if (searchParams.shipped) params.set("shipped", searchParams.shipped);
    if (searchParams.sort) params.set("sort", searchParams.sort);
    // Vendor filter: the API uses a general query, pass it if present
    if (searchParams.vendor) params.set("vendor", searchParams.vendor);

    try {
      const res = await fetch(`/api/v1/projects?${params.toString()}`);
      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();
      const newProjects: ProjectListItem[] = (json.data as Record<string, unknown>[]).map(mapApiProject);

      startTransition(() => {
        setProjects((prev) => {
          // Deduplicate by id
          const existingIds = new Set(prev.map((p) => p.id));
          const unique = newProjects.filter((p) => !existingIds.has(p.id));
          return [...prev, ...unique];
        });
        setPage(nextPage);
        setHasMore(json.has_more === true);
      });
    } catch (err) {
      console.error("[InfiniteScroll] Failed to fetch page:", err);
    } finally {
      setIsFetching(false);
    }
  }, [isFetching, hasMore, page, pageSize, searchParams]);

  // IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isFetching) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isFetching]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {projects.length} of {total} projects
        </p>
        <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
      </div>

      <ProjectGrid projects={projects} viewMode={viewMode} />

      {/* Sentinel element for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" />

      {(isFetching || isLoading) && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          <span className="text-muted-foreground ml-2 text-sm">Loading more projects…</span>
        </div>
      )}

      {!hasMore && projects.length > pageSize && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          You&apos;ve reached the end — {total} projects total
        </p>
      )}
    </div>
  );
}
