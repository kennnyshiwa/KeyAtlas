"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Palette, Store, CheckCircle } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

interface ProjectHit {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  vendorName?: string | null;
}

interface DesignerHit {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string | null;
}

interface VendorHit {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  verified: boolean;
  regionsServed: string[];
}

interface SearchResults {
  projects: ProjectHit[];
  designers: DesignerHit[];
  vendors: VendorHit[];
}

export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ projects: [], designers: [], vendors: [] });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ projects: [], designers: [], vendors: [] });
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5&type=all`);
      if (res.ok) {
        const data = await res.json();
        setResults({
          projects: data.projects ?? [],
          designers: data.designers ?? [],
          vendors: data.vendors ?? [],
        });
      }
    } catch {
      setResults({ projects: [], designers: [], vendors: [] });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchResults(query), 200);
    return () => clearTimeout(timer);
  }, [query, fetchResults]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    router.push(path);
  };

  const hasAnyResults =
    results.projects.length > 0 ||
    results.designers.length > 0 ||
    results.vendors.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search projects, designers, vendors..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!hasAnyResults && <CommandEmpty>No results found.</CommandEmpty>}

        {results.projects.length > 0 && (
          <CommandGroup heading="Projects">
            {results.projects.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`project-${hit.title}`}
                onSelect={() => handleSelect(`/projects/${hit.slug}`)}
              >
                <div className="flex flex-col">
                  <span>{hit.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {CATEGORY_LABELS[hit.category as ProjectCategory]} &middot;{" "}
                    {STATUS_LABELS[hit.status as ProjectStatus]}
                    {hit.vendorName && ` · ${hit.vendorName}`}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.designers.length > 0 && (
          <CommandGroup heading="Designers">
            {results.designers.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`designer-${hit.name}`}
                onSelect={() => handleSelect(`/designers/${hit.slug}`)}
              >
                <Palette className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{hit.name}</span>
                  {hit.description && (
                    <span className="text-muted-foreground text-xs line-clamp-1">
                      {hit.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.vendors.length > 0 && (
          <CommandGroup heading="Vendors">
            {results.vendors.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`vendor-${hit.name}`}
                onSelect={() => handleSelect(`/vendors/${hit.slug}`)}
              >
                <Store className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="flex items-center gap-1">
                    {hit.name}
                    {hit.verified && (
                      <CheckCircle className="h-3 w-3 text-blue-500" aria-label="Verified" />
                    )}
                  </span>
                  {hit.regionsServed.length > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {hit.regionsServed.slice(0, 3).join(", ")}
                      {hit.regionsServed.length > 3 && ` +${hit.regionsServed.length - 3} more`}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
