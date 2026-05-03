"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { DeleteProjectButton } from "@/app/admin/projects/delete-button";
import { CATEGORY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { ProjectStatus } from "@/generated/prisma/client";
import type { PreparedText } from "@/lib/pretext/layout";

interface PretextModule {
  prepare: (text: string, font: string) => PreparedText;
  layout: (
    prepared: PreparedText,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
}

interface AdminProjectListItem {
  id: string;
  title: string;
  slug: string;
  category: keyof typeof CATEGORY_LABELS;
  status: ProjectStatus;
  published: boolean;
  createdAt: string | Date;
  vendor: { name: string } | null;
}

interface AdminProjectsInfiniteTableProps {
  initialProjects: AdminProjectListItem[];
  total: number;
  pageSize: number;
  searchParams: {
    q?: string;
    status?: string;
    published?: string;
  };
}

const DESKTOP_BREAKPOINT = 1024;
const OVERSCAN_PX = 700;
const TITLE_FONT = "500 14px Geist, sans-serif";
const META_FONT = "400 12px Geist, sans-serif";
const TITLE_LINE_HEIGHT = 20;
const META_LINE_HEIGHT = 16;
const ROW_PADDING_Y = 14;
const ROW_MIN_HEIGHT_DESKTOP = 76;
const ROW_MIN_HEIGHT_MOBILE = 132;
const SCROLLER_HEIGHT = "calc(100vh - 320px)";

function getStartIndex(offsets: number[], scrollTop: number) {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (offsets[mid] <= scrollTop) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

export function AdminProjectsInfiniteTable({
  initialProjects,
  total,
  pageSize,
  searchParams,
}: AdminProjectsInfiniteTableProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialProjects.length < total);
  const [isFetching, setIsFetching] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pretext, setPretext] = useState<PretextModule | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    import("@/lib/pretext/layout")
      .then((mod) => {
        if (cancelled) return;
        const maybeDefault = mod as Record<string, unknown> & { default?: unknown };
        if (typeof maybeDefault.prepare === "function") {
          setPretext(mod as unknown as PretextModule);
          return;
        }
        if (
          maybeDefault.default &&
          typeof (maybeDefault.default as Record<string, unknown>).prepare === "function"
        ) {
          setPretext(maybeDefault.default as PretextModule);
        }
      })
      .catch((error) => {
        console.warn("[AdminProjectsInfiniteTable] Failed to load Pretext", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setProjects(initialProjects);
    setPage(1);
    setHasMore(initialProjects.length < total);
    setIsFetching(false);
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [initialProjects, total]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));

    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.published) params.set("published", searchParams.published);

    return params;
  }, [pageSize, searchParams]);

  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return;
    setIsFetching(true);

    const nextPage = page + 1;
    const params = new URLSearchParams(queryString);
    params.set("page", String(nextPage));

    try {
      const res = await fetch(`/api/admin/projects?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();
      const newProjects = (json.data ?? []) as AdminProjectListItem[];

      setProjects((prev) => {
        const existingIds = new Set(prev.map((project) => project.id));
        const uniqueProjects = newProjects.filter((project) => !existingIds.has(project.id));
        return [...prev, ...uniqueProjects];
      });
      setPage(nextPage);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      console.error("[AdminProjectsInfiniteTable] Failed to fetch next page", error);
    } finally {
      setIsFetching(false);
    }
  }, [hasMore, isFetching, page, queryString]);

  const isDesktop = containerSize.width >= DESKTOP_BREAKPOINT;
  const gridTemplateColumns = isDesktop
    ? "minmax(280px,2.2fr) 140px 150px 110px 120px 88px"
    : "minmax(0,1fr)";
  const textWidth = Math.max(
    isDesktop
      ? containerSize.width - (140 + 150 + 110 + 120 + 88) - 80
      : containerSize.width - 32,
    220,
  );

  const layoutState = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const project of projects) {
      const metaText = `/${project.slug}${project.vendor ? ` • ${project.vendor.name}` : ""}`;

      let textHeight = TITLE_LINE_HEIGHT + META_LINE_HEIGHT;
      if (pretext) {
        const preparedTitle = pretext.prepare(project.title, TITLE_FONT);
        const preparedMeta = pretext.prepare(metaText, META_FONT);
        const titleHeight = pretext.layout(preparedTitle, textWidth, TITLE_LINE_HEIGHT).height;
        const metaHeight = pretext.layout(preparedMeta, textWidth, META_LINE_HEIGHT).height;
        textHeight = titleHeight + metaHeight;
      }

      const rowHeight = isDesktop
        ? Math.max(ROW_MIN_HEIGHT_DESKTOP, textHeight + ROW_PADDING_Y * 2)
        : Math.max(ROW_MIN_HEIGHT_MOBILE, textHeight + ROW_PADDING_Y * 2 + 44);

      offsets.push(totalHeight);
      heights.push(rowHeight);
      totalHeight += rowHeight;
    }

    return { offsets, heights, totalHeight };
  }, [isDesktop, pretext, projects, textWidth]);

  const visibleRange = useMemo(() => {
    if (projects.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const startIndex = Math.max(0, getStartIndex(layoutState.offsets, Math.max(0, scrollTop - 200)) - 1);
    const bottomBoundary = scrollTop + containerSize.height + OVERSCAN_PX;

    let endIndex = startIndex;
    while (
      endIndex < projects.length &&
      layoutState.offsets[endIndex] < bottomBoundary
    ) {
      endIndex += 1;
    }

    return { startIndex, endIndex: Math.min(projects.length, endIndex + 1) };
  }, [containerSize.height, layoutState.offsets, projects.length, scrollTop]);

  const virtualProjects = useMemo(
    () =>
      projects.slice(visibleRange.startIndex, visibleRange.endIndex).map((project, index) => {
        const actualIndex = visibleRange.startIndex + index;
        return {
          project,
          index: actualIndex,
          top: layoutState.offsets[actualIndex] ?? 0,
          height: layoutState.heights[actualIndex] ?? ROW_MIN_HEIGHT_DESKTOP,
        };
      }),
    [layoutState.heights, layoutState.offsets, projects, visibleRange.endIndex, visibleRange.startIndex],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || isFetching || !hasMore) return;

    const distanceFromBottom =
      layoutState.totalHeight - (scrollTop + (containerSize.height || element.clientHeight));

    if (distanceFromBottom < 900) {
      void fetchNextPage();
    }
  }, [containerSize.height, fetchNextPage, hasMore, isFetching, layoutState.totalHeight, scrollTop]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || isFetching || !hasMore) return;

    const timeoutId = window.setTimeout(() => {
      if (element.scrollHeight <= element.clientHeight + 32) {
        void fetchNextPage();
      }
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [fetchNextPage, hasMore, isFetching, layoutState.totalHeight, projects.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Showing {projects.length} of {total} projects
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div
          className="hidden border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid lg:gap-4"
          style={{ gridTemplateColumns }}
        >
          <div>Project</div>
          <div>Category</div>
          <div>Status</div>
          <div>Published</div>
          <div>Created</div>
          <div className="text-right">Actions</div>
        </div>

        {projects.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-muted-foreground">No projects match those filters.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/admin/projects/new">Create a project</Link>
            </Button>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="relative overflow-auto"
            style={{ height: SCROLLER_HEIGHT, minHeight: 520 }}
          >
            <div style={{ height: layoutState.totalHeight, position: "relative" }}>
              {virtualProjects.map(({ project, top, height }) => (
                <div
                  key={project.id}
                  className="absolute inset-x-0 border-b bg-background"
                  style={{ top, height }}
                >
                  {isDesktop ? (
                    <div
                      className="grid h-full items-center gap-4 px-4"
                      style={{ gridTemplateColumns }}
                    >
                      <div className="min-w-0 py-3">
                        <div className="font-medium break-words">{project.title}</div>
                        <div className="text-muted-foreground mt-1 text-xs break-words">
                          /{project.slug}
                          {project.vendor && <span> • {project.vendor.name}</span>}
                        </div>
                      </div>
                      <div>
                        <Badge variant="outline">{CATEGORY_LABELS[project.category]}</Badge>
                      </div>
                      <div>
                        <ProjectStatusBadge status={project.status} />
                      </div>
                      <div>
                        {project.published ? (
                          <Badge variant="default">Live</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {formatDate(new Date(project.createdAt))}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/projects/admin-edit/${project.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-between gap-3 px-4 py-3">
                      <div className="space-y-2 min-w-0">
                        <div className="font-medium break-words">{project.title}</div>
                        <div className="text-muted-foreground text-xs break-words">
                          /{project.slug}
                          {project.vendor && <span> • {project.vendor.name}</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{CATEGORY_LABELS[project.category]}</Badge>
                          <ProjectStatusBadge status={project.status} />
                          {project.published ? (
                            <Badge variant="default">Live</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-muted-foreground text-sm">
                          {formatDate(new Date(project.createdAt))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/projects/admin-edit/${project.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isFetching && (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading more projects…
        </div>
      )}

      {hasMore && !isFetching && projects.length > 0 && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
            Load more projects
          </Button>
        </div>
      )}

      {!hasMore && projects.length > pageSize && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          You&apos;ve reached the end, {total} projects total.
        </p>
      )}
    </div>
  );
}
