"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CATEGORY_LABELS, PROFILE_OPTIONS } from "@/lib/constants";
import { Filter, X, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface AdvancedFiltersProps {
  vendors: { id: string; name: string }[];
}

export function AdvancedFilters({ vendors }: AdvancedFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<string[]>(
    searchParams.get("category")?.split(",").filter(Boolean) ?? []
  );
  const [profiles, setProfiles] = useState<string[]>(
    searchParams.get("profile")?.split(",").filter(Boolean) ?? []
  );
  const [designerQuery, setDesignerQuery] = useState(
    searchParams.get("designer") ?? ""
  );
  const [vendorIds, setVendorIds] = useState<string[]>(
    searchParams.get("vendor")?.split(",").filter(Boolean) ?? []
  );
  const [shipped, setShipped] = useState(
    searchParams.get("shipped") === "true"
  );

  const hasFilters =
    categories.length > 0 ||
    profiles.length > 0 ||
    designerQuery.length > 0 ||
    vendorIds.length > 0 ||
    shipped;

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      // Remove page when filters change
      params.delete("page");

      if (categories.length > 0) params.set("category", categories.join(","));
      else params.delete("category");

      if (profiles.length > 0) params.set("profile", profiles.join(","));
      else params.delete("profile");

      if (designerQuery) params.set("designer", designerQuery);
      else params.delete("designer");

      if (vendorIds.length > 0) params.set("vendor", vendorIds.join(","));
      else params.delete("vendor");

      if (shipped) params.set("shipped", "true");
      else params.delete("shipped");

      router.push(`/projects?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timeout);
  }, [categories, profiles, designerQuery, vendorIds, shipped, router]);

  const clearAll = () => {
    setCategories([]);
    setProfiles([]);
    setDesignerQuery("");
    setVendorIds([]);
    setShipped(false);
  };

  const toggleValue = (
    list: string[],
    setter: (v: string[]) => void,
    value: string
  ) => {
    setter(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value]
    );
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Filter link copied");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {hasFilters && (
              <span className="bg-primary text-primary-foreground ml-2 rounded-full px-1.5 text-xs">
                {categories.length +
                  profiles.length +
                  (designerQuery ? 1 : 0) +
                  vendorIds.length +
                  (shipped ? 1 : 0)}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="start">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Category</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={categories.includes(value)}
                    onCheckedChange={() =>
                      toggleValue(categories, setCategories, value)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Profile</h4>
            <div className="grid grid-cols-2 gap-2">
              {PROFILE_OPTIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={profiles.includes(p)}
                    onCheckedChange={() =>
                      toggleValue(profiles, setProfiles, p)
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Designer</h4>
            <Input
              placeholder="Search by designer name..."
              value={designerQuery}
              onChange={(e) => setDesignerQuery(e.target.value)}
            />
          </div>

          {vendors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Vendor</h4>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {vendors.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={vendorIds.includes(v.id)}
                      onCheckedChange={() =>
                        toggleValue(vendorIds, setVendorIds, v.id)
                      }
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={shipped}
              onCheckedChange={(v) => setShipped(!!v)}
            />
            Shipped only
          </label>
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <>
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <LinkIcon className="mr-1 h-3 w-3" />
            Copy Link
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="mr-1 h-3 w-3" />
            Clear All
          </Button>
        </>
      )}
    </div>
  );
}
