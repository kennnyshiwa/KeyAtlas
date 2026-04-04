"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Palette, Store, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

interface SearchProject {
  id: string;
  title: string;
  slug: string;
  category: ProjectCategory;
  status: ProjectStatus;
  vendorName?: string;
}

interface SearchDesigner {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
}

interface SearchVendor {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  verified?: boolean;
  regionsServed?: string[];
}

interface SearchResults {
  projects: SearchProject[];
  designers: SearchDesigner[];
  vendors: SearchVendor[];
}

type ResultItem =
  | { type: "project"; data: SearchProject }
  | { type: "designer"; data: SearchDesigner }
  | { type: "vendor"; data: SearchVendor };

function getItemHref(item: ResultItem): string {
  switch (item.type) {
    case "project":
      return `/projects/${item.data.slug}`;
    case "designer":
      return `/designers/${item.data.slug}`;
    case "vendor":
      return `/vendors/${item.data.slug}`;
  }
}

function flattenResults(results: SearchResults): ResultItem[] {
  const items: ResultItem[] = [];
  for (const p of results.projects) items.push({ type: "project", data: p });
  for (const d of results.designers) items.push({ type: "designer", data: d });
  for (const v of results.vendors) items.push({ type: "vendor", data: v });
  return items;
}

export function NavbarSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatItems = results ? flattenResults(results) : [];
  const showDropdown = focused && query.trim().length > 0;
  const totalHits = flatItems.length;

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&type=all&limit=5`
      );
      if (res.ok) {
        const data: SearchResults = await res.json();
        setResults(data);
      }
    } catch {
      // silently ignore search errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setActiveIndex(-1);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchResults(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) {
      if (e.key === "Enter") {
        const q = query.trim();
        router.push(q ? `/projects?q=${encodeURIComponent(q)}` : "/projects");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, totalHits - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          const item = flatItems[activeIndex];
          router.push(getItemHref(item));
          setQuery("");
          setResults(null);
          setFocused(false);
          inputRef.current?.blur();
        } else {
          const q = query.trim();
          router.push(q ? `/projects?q=${encodeURIComponent(q)}` : "/projects");
          setFocused(false);
        }
        break;
      case "Escape":
        setFocused(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }

  function handleFocus() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setFocused(true);
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setFocused(false);
      setActiveIndex(-1);
    }, 150);
  }

  function handleItemClick(item: ResultItem) {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    router.push(getItemHref(item));
    setQuery("");
    setResults(null);
    setFocused(false);
  }

  // Build flat index for keyboard nav
  let flatIndex = 0;

  return (
    <div className="relative hidden md:block">
      <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 z-10" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Search projects, designers, vendors..."
        className="h-9 w-64 pl-9"
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute left-0 top-full mt-1 w-64 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </div>
          )}

          {!loading && totalHits === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No results
            </div>
          )}

          {!loading && results && results.projects.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                Projects
              </div>
              {results.projects.map((project) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={project.id}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors",
                      activeIndex === idx ? "bg-accent" : "hover:bg-accent"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleItemClick({ type: "project", data: project })}
                  >
                    <span className="font-medium truncate">{project.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{CATEGORY_LABELS[project.category] ?? project.category}</span>
                      <span>·</span>
                      <span>{STATUS_LABELS[project.status] ?? project.status}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && results && results.designers.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                Designers
              </div>
              {results.designers.map((designer) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={designer.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      activeIndex === idx ? "bg-accent" : "hover:bg-accent"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleItemClick({ type: "designer", data: designer })}
                  >
                    <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{designer.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && results && results.vendors.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                Vendors
              </div>
              {results.vendors.map((vendor) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={vendor.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      activeIndex === idx ? "bg-accent" : "hover:bg-accent"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleItemClick({ type: "vendor", data: vendor })}
                  >
                    <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{vendor.name}</span>
                    {vendor.verified && (
                      <CheckCircle className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
