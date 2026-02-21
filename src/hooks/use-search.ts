"use client";

import { useState, useCallback } from "react";
import { useDebounce } from "./use-debounce";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  heroImage?: string | null;
  vendorName?: string | null;
}

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.hits ?? []);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    search,
    debouncedQuery,
  };
}
