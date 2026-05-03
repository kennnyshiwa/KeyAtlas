"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VendorDeleteButton } from "@/components/admin/vendor-delete-button";
import type { PreparedText } from "@/lib/pretext/layout";

interface PretextModule {
  prepare: (text: string, font: string) => PreparedText;
  layout: (
    prepared: PreparedText,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
}

interface AdminVendorListItem {
  id: string;
  name: string;
  slug: string;
  regionsServed: string[];
  verified: boolean;
  _count: { projects: number; projectVendors: number };
}

interface AdminVendorsInfiniteTableProps {
  initialVendors: AdminVendorListItem[];
  total: number;
  pageSize: number;
  searchParams: {
    q?: string;
  };
  isAdmin: boolean;
}

const DESKTOP_BREAKPOINT = 1024;
const OVERSCAN_PX = 700;
const NAME_FONT = "500 14px Geist, sans-serif";
const META_FONT = "400 12px Geist, sans-serif";
const NAME_LINE_HEIGHT = 20;
const META_LINE_HEIGHT = 16;
const ROW_PADDING_Y = 14;
const ROW_MIN_HEIGHT_DESKTOP = 76;
const ROW_MIN_HEIGHT_MOBILE = 136;
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

export function AdminVendorsInfiniteTable({
  initialVendors,
  total,
  pageSize,
  searchParams,
  isAdmin,
}: AdminVendorsInfiniteTableProps) {
  const [vendors, setVendors] = useState(initialVendors);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialVendors.length < total);
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
        console.warn("[AdminVendorsInfiniteTable] Failed to load Pretext", error);
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
    setVendors(initialVendors);
    setPage(1);
    setHasMore(initialVendors.length < total);
    setIsFetching(false);
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [initialVendors, total]);

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
      const res = await fetch(`/api/admin/vendors?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();
      const newVendors = (json.data ?? []) as AdminVendorListItem[];

      setVendors((prev) => {
        const existingIds = new Set(prev.map((vendor) => vendor.id));
        const uniqueVendors = newVendors.filter((vendor) => !existingIds.has(vendor.id));
        return [...prev, ...uniqueVendors];
      });
      setPage(nextPage);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      console.error("[AdminVendorsInfiniteTable] Failed to fetch next page", error);
    } finally {
      setIsFetching(false);
    }
  }, [hasMore, isFetching, page, queryString]);

  const isDesktop = containerSize.width >= DESKTOP_BREAKPOINT;
  const gridTemplateColumns = isDesktop
    ? "minmax(240px,2fr) minmax(180px,1.2fr) minmax(220px,1.5fr) 90px 90px 88px"
    : "minmax(0,1fr)";
  const textWidth = Math.max(
    isDesktop ? containerSize.width - (180 + 220 + 90 + 90 + 88) - 80 : containerSize.width - 32,
    220,
  );

  const layoutState = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const vendor of vendors) {
      const slugText = `/${vendor.slug}`;
      const regionText = vendor.regionsServed.length > 0 ? vendor.regionsServed.join(", ") : "No regions";

      let textHeight = NAME_LINE_HEIGHT + META_LINE_HEIGHT * 2;
      if (pretext) {
        const preparedName = pretext.prepare(vendor.name, NAME_FONT);
        const preparedSlug = pretext.prepare(slugText, META_FONT);
        const preparedRegions = pretext.prepare(regionText, META_FONT);
        const nameHeight = pretext.layout(preparedName, textWidth, NAME_LINE_HEIGHT).height;
        const slugHeight = pretext.layout(preparedSlug, textWidth, META_LINE_HEIGHT).height;
        const regionHeight = pretext.layout(preparedRegions, textWidth, META_LINE_HEIGHT).height;
        textHeight = nameHeight + slugHeight + regionHeight;
      }

      const rowHeight = isDesktop
        ? Math.max(ROW_MIN_HEIGHT_DESKTOP, textHeight + ROW_PADDING_Y * 2)
        : Math.max(ROW_MIN_HEIGHT_MOBILE, textHeight + ROW_PADDING_Y * 2 + 44);

      offsets.push(totalHeight);
      heights.push(rowHeight);
      totalHeight += rowHeight;
    }

    return { offsets, heights, totalHeight };
  }, [isDesktop, pretext, textWidth, vendors]);

  const visibleRange = useMemo(() => {
    if (vendors.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const startIndex = Math.max(0, getStartIndex(layoutState.offsets, Math.max(0, scrollTop - 200)) - 1);
    const bottomBoundary = scrollTop + containerSize.height + OVERSCAN_PX;

    let endIndex = startIndex;
    while (endIndex < vendors.length && layoutState.offsets[endIndex] < bottomBoundary) {
      endIndex += 1;
    }

    return { startIndex, endIndex: Math.min(vendors.length, endIndex + 1) };
  }, [containerSize.height, layoutState.offsets, scrollTop, vendors.length]);

  const virtualVendors = useMemo(
    () =>
      vendors.slice(visibleRange.startIndex, visibleRange.endIndex).map((vendor, index) => {
        const actualIndex = visibleRange.startIndex + index;
        return {
          vendor,
          top: layoutState.offsets[actualIndex] ?? 0,
          height: layoutState.heights[actualIndex] ?? ROW_MIN_HEIGHT_DESKTOP,
        };
      }),
    [layoutState.heights, layoutState.offsets, vendors, visibleRange.endIndex, visibleRange.startIndex],
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
  }, [fetchNextPage, hasMore, isFetching, layoutState.totalHeight, vendors.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Showing {vendors.length} of {total} vendors
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div
          className="hidden border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid lg:gap-4"
          style={{ gridTemplateColumns }}
        >
          <div>Vendor</div>
          <div>Slug</div>
          <div>Regions</div>
          <div>Projects</div>
          <div>Verified</div>
          <div className="text-right">Actions</div>
        </div>

        {vendors.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-muted-foreground">No vendors match that search.</p>
            {isAdmin && (
              <Button asChild variant="link" className="mt-2">
                <Link href="/admin/vendors/new">Add a vendor</Link>
              </Button>
            )}
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="relative overflow-auto"
            style={{ height: SCROLLER_HEIGHT, minHeight: 520 }}
          >
            <div style={{ height: layoutState.totalHeight, position: "relative" }}>
              {virtualVendors.map(({ vendor, top, height }) => (
                <div
                  key={vendor.id}
                  className="absolute inset-x-0 border-b bg-background"
                  style={{ top, height }}
                >
                  {isDesktop ? (
                    <div
                      className="grid h-full items-center gap-4 px-4"
                      style={{ gridTemplateColumns }}
                    >
                      <div className="min-w-0 py-3">
                        <div className="font-medium break-words">{vendor.name}</div>
                      </div>
                      <div className="text-muted-foreground text-sm break-words">/{vendor.slug}</div>
                      <div className="text-muted-foreground text-sm break-words">
                        {vendor.regionsServed.length > 0 ? vendor.regionsServed.join(", ") : "No regions"}
                      </div>
                      <div className="text-sm">{vendor._count.projects + vendor._count.projectVendors}</div>
                      <div>
                        {vendor.verified ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : null}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/vendors/${vendor.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        {isAdmin && (
                          <VendorDeleteButton vendorId={vendor.id} vendorName={vendor.name} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-between gap-3 px-4 py-3">
                      <div className="space-y-2 min-w-0">
                        <div className="font-medium break-words">{vendor.name}</div>
                        <div className="text-muted-foreground text-sm break-words">/{vendor.slug}</div>
                        <div className="text-muted-foreground text-sm break-words">
                          {vendor.regionsServed.length > 0 ? vendor.regionsServed.join(", ") : "No regions"}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span>{vendor._count.projects + vendor._count.projectVendors} projects</span>
                          {vendor.verified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle className="h-4 w-4" /> Verified
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/vendors/${vendor.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        {isAdmin && (
                          <VendorDeleteButton vendorId={vendor.id} vendorName={vendor.name} />
                        )}
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
          Loading more vendors…
        </div>
      )}

      {hasMore && !isFetching && vendors.length > 0 && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
            Load more vendors
          </Button>
        </div>
      )}

      {!hasMore && vendors.length > pageSize && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          You&apos;ve reached the end, {total} vendors total.
        </p>
      )}
    </div>
  );
}
