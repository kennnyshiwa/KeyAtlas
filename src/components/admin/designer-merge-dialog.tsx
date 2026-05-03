"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Merge, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Designer {
  id: string;
  name: string;
  slug: string;
  _count: { projects: number };
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

export function DesignerMergeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const designerCacheRef = useRef<Map<string, Designer>>(new Map());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const cacheDesigners = useCallback((items: Designer[]) => {
    for (const item of items) {
      designerCacheRef.current.set(item.id, item);
    }
  }, []);

  const fetchPage = useCallback(
    async (pageToLoad: number, query: string) => {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(PAGE_SIZE),
      });
      if (query) params.set("q", query);

      const res = await fetch(`/api/admin/designers?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json() as Promise<{
        data?: Designer[];
        hasMore?: boolean;
      }>;
    },
    []
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadFirstPage = async () => {
      setIsLoadingInitial(true);
      setIsLoadingMore(false);
      try {
        const json = await fetchPage(1, debouncedSearch);
        if (cancelled) return;

        const nextDesigners = (json.data ?? []) as Designer[];
        cacheDesigners(nextDesigners);
        setDesigners(nextDesigners);
        setPage(1);
        setHasMore(Boolean(json.hasMore));
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load designers");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInitial(false);
        }
      }
    };

    void loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [cacheDesigners, debouncedSearch, fetchPage, open]);

  const loadNextPage = useCallback(async () => {
    if (!open || isLoadingInitial || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const nextPage = page + 1;

    try {
      const json = await fetchPage(nextPage, debouncedSearch);
      const nextDesigners = (json.data ?? []) as Designer[];
      cacheDesigners(nextDesigners);
      setDesigners((prev) => {
        const existingIds = new Set(prev.map((designer) => designer.id));
        const uniqueDesigners = nextDesigners.filter((designer) => !existingIds.has(designer.id));
        return [...prev, ...uniqueDesigners];
      });
      setPage(nextPage);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more designers");
    } finally {
      setIsLoadingMore(false);
    }
  }, [cacheDesigners, debouncedSearch, fetchPage, hasMore, isLoadingInitial, isLoadingMore, open, page]);

  useEffect(() => {
    if (!open || isLoadingInitial || isLoadingMore || !hasMore) return;

    const checkIfNeedMoreContent = () => {
      const el = scrollAreaRef.current;
      if (!el || isLoadingInitial || isLoadingMore || !hasMore) return;
      if (el.scrollHeight <= el.clientHeight + 40) {
        void loadNextPage();
      }
    };

    const timeoutId = window.setTimeout(checkIfNeedMoreContent, 100);
    return () => window.clearTimeout(timeoutId);
  }, [designers.length, hasMore, isLoadingInitial, isLoadingMore, loadNextPage, open]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el || isLoadingInitial || isLoadingMore || !hasMore) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 160) {
      void loadNextPage();
    }
  }, [hasMore, isLoadingInitial, isLoadingMore, loadNextPage]);

  const getDesignerById = useCallback(
    (id: string) => designers.find((designer) => designer.id === id) ?? designerCacheRef.current.get(id),
    [designers]
  );

  const selectedTarget = useMemo(() => getDesignerById(targetId), [getDesignerById, targetId]);
  const selectedSources = useMemo(
    () => sourceIds.map((id) => getDesignerById(id)).filter((designer): designer is Designer => Boolean(designer)),
    [getDesignerById, sourceIds]
  );

  const toggleSource = (id: string) => {
    if (id === targetId) return;
    setSourceIds((prev) => (prev.includes(id) ? prev.filter((sourceId) => sourceId !== id) : [...prev, id]));
  };

  const handleMerge = async () => {
    if (!targetId || sourceIds.length === 0) return;

    const sourceNames = selectedSources.map((source) => source.name).join(", ");

    if (
      !confirm(
        `Merge ${sourceIds.length} designer(s) (${sourceNames}) into "${selectedTarget?.name}"?\n\nAll their projects will be reassigned and the merged designers will be deleted. This cannot be undone.`
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/designers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, sourceIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Merge failed");
      }

      const data = await res.json();
      toast.success(
        `Merged ${data.merged.length} designer(s) into "${data.into}" (${data.projectsMoved} projects moved)`
      );
      setOpen(false);
      setTargetId("");
      setSourceIds([]);
      setSearch("");
      setDebouncedSearch("");
      setDesigners([]);
      setPage(1);
      setHasMore(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Merge className="mr-2 h-4 w-4" />
          Merge Designers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Merge Designers</DialogTitle>
          <DialogDescription>
            Search the full designer directory, then pick a target and the duplicates to merge into it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div>
            <input
              type="text"
              placeholder="Search designers by name, slug, or project"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto border rounded-md"
          >
            {isLoadingInitial ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading designers…
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Target</th>
                    <th className="px-3 py-2 text-left font-medium">Merge</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Slug</th>
                    <th className="px-3 py-2 text-right font-medium">Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {designers.map((designer) => (
                    <tr
                      key={designer.id}
                      className={`border-t ${
                        designer.id === targetId
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : sourceIds.includes(designer.id)
                            ? "bg-red-50 dark:bg-red-950/30"
                            : ""
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="radio"
                          name="target"
                          checked={targetId === designer.id}
                          onChange={() => {
                            setTargetId(designer.id);
                            setSourceIds((prev) => prev.filter((sourceId) => sourceId !== designer.id));
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={sourceIds.includes(designer.id)}
                          disabled={designer.id === targetId}
                          onChange={() => toggleSource(designer.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-1.5">{designer.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{designer.slug}</td>
                      <td className="px-3 py-1.5 text-right">{designer._count.projects}</td>
                    </tr>
                  ))}
                  {!isLoadingInitial && designers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        No designers match that search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {isLoadingMore && (
              <div className="flex items-center justify-center border-t px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading more designers…
              </div>
            )}

            {hasMore && !isLoadingInitial && !isLoadingMore && designers.length > 0 && (
              <div className="flex justify-center border-t px-3 py-3">
                <Button variant="outline" size="sm" onClick={() => void loadNextPage()}>
                  Load more designers
                </Button>
              </div>
            )}
          </div>

          {targetId && sourceIds.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Will merge <span className="font-medium text-foreground">{sourceIds.length} designer(s)</span>{" "}
              into <span className="font-medium text-emerald-600">{selectedTarget?.name ?? "selected target"}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={isLoadingInitial || !targetId || sourceIds.length === 0 || submitting}
              variant="destructive"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Merge {sourceIds.length > 0 ? `(${sourceIds.length})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
