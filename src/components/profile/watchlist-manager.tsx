"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { Trash2, ExternalLink, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface SavedFilter {
  id: string;
  name: string;
  criteria: Record<string, string | boolean>;
  notify: boolean;
  createdAt: string;
}

export function WatchlistManager() {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/saved-filters")
      .then((r) => r.json())
      .then((data) => setFilters(data.filters || []))
      .catch(() => toast.error("Failed to load watchlists"))
      .finally(() => setLoading(false));
  }, []);

  const toggleNotify = async (id: string, notify: boolean) => {
    const res = await fetch(`/api/saved-filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify }),
    });
    if (res.ok) {
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, notify } : f)));
    } else {
      toast.error("Failed to update");
    }
  };

  const deleteFilter = async (id: string) => {
    const res = await fetch(`/api/saved-filters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFilters((prev) => prev.filter((f) => f.id !== id));
      toast.success("Watchlist removed");
    } else {
      toast.error("Failed to delete");
    }
  };

  const buildFilterUrl = (criteria: Record<string, string | boolean>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(criteria)) {
      if (v !== undefined && v !== false && v !== "") {
        params.set(k, String(v));
      }
    }
    return `/projects?${params.toString()}`;
  };

  if (loading) {
    return <div className="text-muted-foreground py-8 text-center text-sm">Loading watchlists…</div>;
  }

  if (filters.length === 0) {
    return (
      <EmptyState
        title="No saved filters"
        description="Save a filter from the Projects page to create a watchlist."
      />
    );
  }

  return (
    <div className="space-y-3">
      {filters.map((f) => (
        <Card key={f.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{f.name}</span>
                {f.notify ? (
                  <Badge variant="secondary" className="text-xs">
                    <Bell className="mr-1 h-3 w-3" /> Notifications on
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    <BellOff className="mr-1 h-3 w-3" /> Notifications off
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(f.criteria).map(([k, v]) =>
                  v ? (
                    <Badge key={k} variant="outline" className="text-xs">
                      {k}: {String(v)}
                    </Badge>
                  ) : null
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={f.notify}
                onCheckedChange={(v) => toggleNotify(f.id, v)}
                aria-label="Toggle notifications"
              />
              <Button variant="outline" size="sm" asChild>
                <Link href={buildFilterUrl(f.criteria)}>
                  <ExternalLink className="mr-1 h-3 w-3" />
                  View
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteFilter(f.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
