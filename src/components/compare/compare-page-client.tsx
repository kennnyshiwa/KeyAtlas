"use client";

import { useState, useEffect } from "react";
import { SmartImage } from "@/components/shared/smart-image";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { formatPrice, formatDate } from "@/lib/utils";
import { Search, X, Plus } from "lucide-react";
import type { ProjectCategory, ProjectStatus } from "@/generated/prisma/client";

interface CompareProject {
  id: string;
  title: string;
  slug: string;
  heroImage: string | null;
  category: ProjectCategory;
  status: ProjectStatus;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  profile: string | null;
  designer: string | null;
  gbStartDate: string | null;
  gbEndDate: string | null;
  estimatedDelivery: string | null;
  vendor: { name: string } | null;
}

interface ComparePageClientProps {
  initialIds?: string;
}

export function ComparePageClient({ initialIds }: ComparePageClientProps) {
  const [projects, setProjects] = useState<CompareProject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompareProject[]>([]);

  useEffect(() => {
    if (!initialIds) return;

    fetch(`/api/compare?ids=${encodeURIComponent(initialIds)}`)
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, [initialIds]);

  async function searchProjects(q: string) {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!res.ok) return;

      const data = await res.json();
      setSearchResults(
        data.results?.filter(
          (r: CompareProject) => !projects.some((p) => p.id === r.id)
        ) || []
      );
    } catch {
      // ignore
    }
  }

  function addProject(project: CompareProject) {
    if (projects.length >= 4) return;
    setProjects((prev) => [...prev, project]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  const compareFields: { label: string; render: (p: CompareProject) => React.ReactNode }[] = [
    { label: "Category", render: (p) => CATEGORY_LABELS[p.category] },
    { label: "Status", render: (p) => STATUS_LABELS[p.status] },
    { label: "Profile", render: (p) => p.profile || "—" },
    { label: "Designer", render: (p) => p.designer || "—" },
    { label: "Vendor", render: (p) => p.vendor?.name || "—" },
    {
      label: "Price",
      render: (p) =>
        p.priceMin != null
          ? `${formatPrice(p.priceMin, p.currency)}${
              p.priceMax && p.priceMax !== p.priceMin
                ? ` – ${formatPrice(p.priceMax, p.currency)}`
                : ""
            }`
          : "—",
    },
    {
      label: "GB Start",
      render: (p) => (p.gbStartDate ? formatDate(new Date(p.gbStartDate)) : "—"),
    },
    {
      label: "GB End",
      render: (p) => (p.gbEndDate ? formatDate(new Date(p.gbEndDate)) : "—"),
    },
    {
      label: "Est. Delivery",
      render: (p) =>
        p.estimatedDelivery ? formatDate(new Date(p.estimatedDelivery)) : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare Projects"
        description="Compare up to 4 projects side by side."
      />

      {projects.length < 4 && (
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchProjects(e.target.value);
            }}
            placeholder="Search projects to compare..."
            className="pl-9"
          />
          {searchResults.length > 0 && (
            <Card className="absolute z-10 mt-1 w-full">
              <CardContent className="p-1">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                    onClick={() => addProject(result)}
                  >
                    <Plus className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{result.title}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            Search and add projects above to start comparing.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="p-2 text-left text-sm font-medium" />
                {projects.map((p) => (
                  <th key={p.id} className="min-w-[200px] p-2">
                    <div className="space-y-2">
                      {p.heroImage && (
                        <div className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-md">
                          <SmartImage
                            src={p.heroImage}
                            alt={p.title}
                            fill
                            className="object-cover"
                            sizes="200px"
                          />
                        </div>
                      )}
                      <Link
                        href={`/projects/${p.slug}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {p.title}
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeProject(p.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareFields.map((field) => (
                <tr key={field.label} className="border-t">
                  <td className="text-muted-foreground p-2 text-sm font-medium">
                    {field.label}
                  </td>
                  {projects.map((p) => (
                    <td key={p.id} className="p-2 text-center text-sm">
                      {field.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
