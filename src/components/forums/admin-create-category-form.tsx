"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function AdminCreateCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      name: name.trim(),
      slug: (slug.trim() || toSlug(name)).slice(0, 80),
      description: description.trim() || null,
    };

    try {
      const res = await fetch("/api/admin/forums/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create forum category");

      setName("");
      setSlug("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create forum category");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Admin: Create top-level forum</p>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slug) setSlug(toSlug(e.target.value));
        }}
        placeholder="Name (e.g. Keyboard ICs)"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        required
      />
      <input
        value={slug}
        onChange={(e) => setSlug(toSlug(e.target.value))}
        placeholder="slug"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Creating…" : "Create category"}
      </Button>
    </form>
  );
}
