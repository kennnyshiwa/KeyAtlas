"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminCategoryActions({
  id,
  name,
  slug,
  description,
  order,
  threadCount,
}: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  threadCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nextName, setNextName] = useState(name.replace(/^\[Archived\]\s*/, ""));
  const [nextSlug, setNextSlug] = useState(slug);
  const [nextDescription, setNextDescription] = useState(description || "");
  const [nextOrder, setNextOrder] = useState(order);

  async function run(path: string, init: RequestInit) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Request failed");
      router.refresh();
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border p-3 space-y-2">
      <p className="text-xs text-muted-foreground">Admin category controls</p>
      <div className="grid gap-2 md:grid-cols-2">
        <input className="h-8 rounded border px-2 text-sm" value={nextName} onChange={(e) => setNextName(e.target.value)} placeholder="Name" />
        <input className="h-8 rounded border px-2 text-sm" value={nextSlug} onChange={(e) => setNextSlug(e.target.value)} placeholder="Slug" />
        <input className="h-8 rounded border px-2 text-sm md:col-span-2" value={nextDescription} onChange={(e) => setNextDescription(e.target.value)} placeholder="Description" />
        <input className="h-8 rounded border px-2 text-sm" type="number" value={nextOrder} onChange={(e) => setNextOrder(Number(e.target.value || 0))} placeholder="Order" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={loading} onClick={() => run(`/api/admin/forums/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName, slug: nextSlug, description: nextDescription || null, order: nextOrder }) })}>Save</Button>
        <Button size="sm" variant="secondary" disabled={loading} onClick={() => run(`/api/admin/forums/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) })}>Archive</Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => run(`/api/admin/forums/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false }) })}>Unarchive</Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={loading || threadCount > 0}
          onClick={async () => {
            if (!confirm("Delete this empty category permanently?")) return;
            await run(`/api/admin/forums/categories/${id}`, { method: "DELETE" });
          }}
        >
          Delete
        </Button>
      </div>
      {threadCount > 0 && <p className="text-xs text-muted-foreground">Delete disabled: category has threads.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
