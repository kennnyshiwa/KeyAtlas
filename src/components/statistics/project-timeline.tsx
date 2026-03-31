"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PreparedText } from "@/lib/pretext/layout";

interface TimelineProject {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  designer: string | null;
  priceMin: number | null;
  createdAt: string; // serialized Date
}

interface ProjectTimelineProps {
  data: TimelineProject[];
}

// Match the app's constants
const CATEGORY_LABELS: Record<string, string> = {
  KEYBOARDS: "Keyboards",
  KEYCAPS: "Keycaps",
  SWITCHES: "Switches",
  DESKMATS: "Deskmats",
  ARTISANS: "Artisans",
  ACCESSORIES: "Accessories",
};

const STATUS_LABELS: Record<string, string> = {
  INTEREST_CHECK: "Interest Check",
  GROUP_BUY: "Group Buy",
  PRODUCTION: "Production",
  SHIPPING: "Shipping",
  EXTRAS: "Extras",
  IN_STOCK: "In Stock",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  INTEREST_CHECK: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  GROUP_BUY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  PRODUCTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  SHIPPING: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  EXTRAS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  IN_STOCK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  COMPLETED: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  ARCHIVED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

const CATEGORY_COLORS: Record<string, string> = {
  KEYBOARDS: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  KEYCAPS: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  SWITCHES: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  DESKMATS: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  ARTISANS: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  ACCESSORIES: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
};

const ITEM_BASE_HEIGHT = 72; // base card height without title wrapping
const YEAR_MARKER_HEIGHT = 40;
const TITLE_FONT = "14px Geist, sans-serif";
const TITLE_LINE_HEIGHT = 20;
const BUFFER = 10; // extra items above/below viewport
const CONTAINER_HEIGHT = 600;

interface PretextModule {
  prepare: (text: string, font: string) => PreparedText;
  layout: (prepared: PreparedText, maxWidth: number, lineHeight: number) => { height: number; lineCount: number };
}

// Items in the virtual list: either a year marker or a project row
interface VirtualItem {
  type: "year" | "project";
  year?: number;
  project?: TimelineProject;
  height: number;
}

export function ProjectTimeline({ data }: ProjectTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [items, setItems] = useState<VirtualItem[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [totalHeight, setTotalHeight] = useState(0);
  const [ready, setReady] = useState(false);

  // Compute year range for header
  const yearRange = useMemo(() => {
    if (data.length === 0) return "";
    const years = data.map((p) => new Date(p.createdAt).getFullYear());
    const min = Math.min(...years);
    const max = Math.max(...years);
    return `${min}–${max}`;
  }, [data]);

  // Build virtual items with pretext height measurement
  useEffect(() => {
    let cancelled = false;

    async function compute() {
      const mod: PretextModule = await import("@/lib/pretext/layout") as unknown as PretextModule;
      const { prepare, layout } = mod;

      // Width available for title text (container minus padding/badges)
      const titleMaxWidth = 500; // approximate

      const virtualItems: VirtualItem[] = [];
      let lastYear: number | null = null;

      for (const project of data) {
        const year = new Date(project.createdAt).getFullYear();
        if (year !== lastYear) {
          virtualItems.push({ type: "year", year, height: YEAR_MARKER_HEIGHT });
          lastYear = year;
        }

        // Measure title height
        const prepared = prepare(project.title, TITLE_FONT);
        const { lineCount } = layout(prepared, titleMaxWidth, TITLE_LINE_HEIGHT);
        const extraLines = Math.max(0, lineCount - 1);
        const itemHeight = ITEM_BASE_HEIGHT + extraLines * TITLE_LINE_HEIGHT;

        virtualItems.push({ type: "project", project, height: itemHeight });
      }

      // Build cumulative offsets
      const cumOffsets: number[] = new Array(virtualItems.length);
      let cumHeight = 0;
      for (let i = 0; i < virtualItems.length; i++) {
        cumOffsets[i] = cumHeight;
        cumHeight += virtualItems[i].height;
      }

      if (!cancelled) {
        setItems(virtualItems);
        setOffsets(cumOffsets);
        setTotalHeight(cumHeight);
        setReady(true);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [data]);

  // Binary search for first visible item
  const findStartIndex = useCallback(
    (scrollPos: number) => {
      let lo = 0;
      let hi = offsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (offsets[mid] + items[mid].height <= scrollPos) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      return lo;
    },
    [offsets, items],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
    }
  }, []);

  // Compute visible range
  const visibleStart = ready ? findStartIndex(scrollTop) : 0;
  const visibleEnd = useMemo(() => {
    if (!ready) return 0;
    const endPos = scrollTop + CONTAINER_HEIGHT;
    let idx = visibleStart;
    while (idx < items.length && offsets[idx] < endPos) {
      idx++;
    }
    return idx;
  }, [ready, scrollTop, visibleStart, items, offsets]);

  const renderStart = Math.max(0, visibleStart - BUFFER);
  const renderEnd = Math.min(items.length, visibleEnd + BUFFER);

  const renderItems = ready ? items.slice(renderStart, renderEnd) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Project Timeline</span>
          <span className="text-sm font-normal text-muted-foreground">
            {data.length.toLocaleString()} projects · {yearRange}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <div
            className="flex items-center justify-center text-muted-foreground"
            style={{ height: CONTAINER_HEIGHT }}
          >
            Computing layout…
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-y-auto scrollbar-thin"
            style={{ height: CONTAINER_HEIGHT }}
          >
            <div style={{ height: totalHeight, position: "relative" }}>
              {renderItems.map((item, i) => {
                const idx = renderStart + i;
                const top = offsets[idx];

                if (item.type === "year") {
                  return (
                    <div
                      key={`year-${item.year}`}
                      className="sticky z-10 flex items-center bg-muted/80 backdrop-blur-sm px-3 font-semibold text-lg border-b"
                      style={{
                        position: "absolute",
                        top,
                        height: YEAR_MARKER_HEIGHT,
                        left: 0,
                        right: 0,
                      }}
                    >
                      {item.year}
                    </div>
                  );
                }

                const p = item.project!;
                const date = new Date(p.createdAt);
                const dateStr = date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.slug}`}
                    className="absolute left-0 right-0 flex items-start gap-3 px-3 py-2 border-b hover:bg-muted/50 transition-colors"
                    style={{ top, height: item.height }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm leading-5 line-clamp-2">
                        {p.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {p.designer && <span>{p.designer}</span>}
                        {p.priceMin != null && (
                          <span>${(p.priceMin / 100).toFixed(0)}</span>
                        )}
                        <span>{dateStr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[p.category] || ""}`}
                      >
                        {CATEGORY_LABELS[p.category] || p.category}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[p.status] || ""}`}
                      >
                        {STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
