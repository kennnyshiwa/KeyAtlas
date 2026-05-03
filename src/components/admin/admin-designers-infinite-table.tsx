"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesignerDeleteButton } from "@/components/admin/designer-delete-button";
import type { PreparedText } from "@/lib/pretext/layout";

interface PretextModule {
  prepare: (text: string, font: string) => PreparedText;
  layout: (
    prepared: PreparedText,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
}

interface AdminDesignerListItem {
  id: string;
  name: string;
  slug: string;
  _count: { projects: number };
}

interface AdminDesignersInfiniteTableProps {
  initialDesigners: AdminDesignerListItem[];
  total: number;
  pageSize: number;
  searchParams: {
    q?: string;
  };
}

const DESKTOP_BREAKPOINT = 900;
const OVERSCAN_PX = 700;
const NAME_FONT = "500 14px Geist, sans-serif";
const SLUG_FONT = "400 12px Geist, sans-serif";
const NAME_LINE_HEIGHT = 20;
const SLUG_LINE_HEIGHT = 16;
const ROW_PADDING_Y = 14;
const ROW_MIN_HEIGHT_DESKTOP = 72;
const ROW_MIN_HEIGHT_MOBILE = 120;
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

export function AdminDesignersInfiniteTable({
  initialDesigners,
  total,
  pageSize,
  searchParams,
}: AdminDesignersInfiniteTableProps) {
  const [designers, setDesigners] = useState(initialDesigners);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialDesigners.length < total);
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
        console.warn("[AdminDesignersInfiniteTable] Failed to load Pretext", error);
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
    setDesigners(initialDesigners);
    setPage(1);
    setHasMore(initialDesigners.length < total);
    setIsFetching(false);
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [initialDesigners, total]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));

    if (searchParams.q) params.set("q", searchParams.q);

    return params;
  }, [pageSize, searchParams]);

  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return;
    setIsFetching(true);

    const nextPage = page + 1;
    const params = new URLSearchParams(queryString);
    params.set("page", String(nextPage));

    try {
      const res = await fetch(`/api/admin/designers?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();
      const newDesigners = (json.data ?? []) as AdminDesignerListItem[];

      setDesigners((prev) => {
        const existingIds = new Set(prev.map((designer) => designer.id));
        const uniqueDesigners = newDesigners.filter((designer) => !existingIds.has(designer.id));
        return [...prev, ...uniqueDesigners];
      });
      setPage(nextPage);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      console.error("[AdminDesignersInfiniteTable] Failed to fetch next page", error);
    } finally {
      setIsFetching(false);
    }
  }, [hasMore, isFetching, page, queryString]);

  const isDesktop = containerSize.width >= DESKTOP_BREAKPOINT;
  const gridTemplateColumns = isDesktop
    ? "minmax(260px,2fr) minmax(220px,1.4fr) 100px 88px"
    : "minmax(0,1fr)";
  const textWidth = Math.max(
    isDesktop ? containerSize.width - (220 + 100 + 88) - 64 : containerSize.width - 32,
    220,
  );

  const layoutState = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const designer of designers) {
      const slugText = `/${designer.slug}`;

      let textHeight = NAME_LINE_HEIGHT + SLUG_LINE_HEIGHT;
      if (pretext) {
        const preparedName = pretext.prepare(designer.name, NAME_FONT);
        const preparedSlug = pretext.prepare(slugText, SLUG_FONT);
        const nameHeight = pretext.layout(preparedName, textWidth, NAME_LINE_HEIGHT).height;
        const slugHeight = pretext.layout(preparedSlug, textWidth, SLUG_LINE_HEIGHT).height;
        textHeight = nameHeight + slugHeight;
      }

      const rowHeight = isDesktop
        ? Math.max(ROW_MIN_HEIGHT_DESKTOP, textHeight + ROW_PADDING_Y * 2)
        : Math.max(ROW_MIN_HEIGHT_MOBILE, textHeight + ROW_PADDING_Y * 2 + 38);

      offsets.push(totalHeight);
      heights.push(rowHeight);
      totalHeight += rowHeight;
    }

    return { offsets, heights, totalHeight };
  }, [designers, isDesktop, pretext, textWidth]);

  const visibleRange = useMemo(() => {
    if (designers.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const startIndex = Math.max(0, getStartIndex(layoutState.offsets, Math.max(0, scrollTop - 200)) - 1);
    const bottomBoundary = scrollTop + containerSize.height + OVERSCAN_PX;

    let endIndex = startIndex;
    while (
      endIndex < designers.length &&
      layoutState.offsets[endIndex] < bottomBoundary
    ) {
      endIndex += 1;
    }

    return { startIndex, endIndex: Math.min(designers.length, endIndex + 1) };
  }, [containerSize.height, designers.length, layoutState.offsets, scrollTop]);

  const virtualDesigners = useMemo(
    () =>
      designers.slice(visibleRange.startIndex, visibleRange.endIndex).map((designer, index) => {
        const actualIndex = visibleRange.startIndex + index;
        return {
          designer,
          top: layoutState.offsets[actualIndex] ?? 0,
          height: layoutState.heights[actualIndex] ?? ROW_MIN_HEIGHT_DESKTOP,
        };
      }),
    [designers, layoutState.heights, layoutState.offsets, visibleRange.endIndex, visibleRange.startIndex],
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
  }, [designers.length, fetchNextPage, hasMore, isFetching, layoutState.totalHeight]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Showing {designers.length} of {total} designers
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div
          className="hidden border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:gap-4"
          style={{ gridTemplateColumns }}
        >
          <div>Name</div>
          <div>Slug</div>
          <div>Projects</div>
          <div className="text-right">Actions</div>
        </div>

        {designers.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-muted-foreground">No designers match that search.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/admin/designers/new">Add a designer</Link>
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
              {virtualDesigners.map(({ designer, top, height }) => (
                <div
                  key={designer.id}
                  className="absolute inset-x-0 border-b bg-background"
                  style={{ top, height }}
                >
                  {isDesktop ? (
                    <div
                      className="grid h-full items-center gap-4 px-4"
                      style={{ gridTemplateColumns }}
                    >
                      <div className="min-w-0 py-3">
                        <div className="font-medium break-words">{designer.name}</div>
                      </div>
                      <div className="text-muted-foreground text-sm break-words">
                        /{designer.slug}
                      </div>
                      <div className="text-sm">{designer._count.projects}</div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/designers/${designer.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DesignerDeleteButton designerId={designer.id} designerName={designer.name} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-between gap-3 px-4 py-3">
                      <div className="space-y-2 min-w-0">
                        <div className="font-medium break-words">{designer.name}</div>
                        <div className="text-muted-foreground text-sm break-words">/{designer.slug}</div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-muted-foreground text-sm">
                          {designer._count.projects} project{designer._count.projects === 1 ? "" : "s"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/admin/designers/${designer.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <DesignerDeleteButton designerId={designer.id} designerName={designer.name} />
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
          Loading more designers…
        </div>
      )}

      {hasMore && !isFetching && designers.length > 0 && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
            Load more designers
          </Button>
        </div>
      )}

      {!hasMore && designers.length > pageSize && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          You&apos;ve reached the end, {total} designers total.
        </p>
      )}
    </div>
  );
}
