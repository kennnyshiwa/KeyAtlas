"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

export function SaveFilterButton() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  // Build criteria from current URL params
  const criteria: Record<string, string | boolean> = {};
  for (const key of ["status", "category", "profile", "designer", "vendor", "q"]) {
    const val = searchParams.get(key);
    if (val) criteria[key] = val;
  }
  if (searchParams.get("shipped") === "true") criteria.shipped = true;

  const hasFilters = Object.keys(criteria).length > 0;

  if (!hasFilters) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for this filter.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), criteria, notify }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save filter");
        return;
      }
      toast.success("Filter saved! You'll be notified of matching projects.");
      setOpen(false);
      setName("");
    } catch {
      toast.error("Failed to save filter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className="mr-1 h-3 w-3" />
          Save Filter
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Current Filter</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g. Cherry keycaps in GB"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="mb-1 font-medium">Active filters:</p>
            <ul className="text-muted-foreground space-y-0.5 text-xs">
              {Object.entries(criteria).map(([key, val]) => (
                <li key={key}>
                  <span className="font-medium capitalize">{key}:</span>{" "}
                  {String(val)}
                </li>
              ))}
            </ul>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={notify}
              onCheckedChange={(v) => setNotify(!!v)}
            />
            Notify me when new projects match
          </label>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Watchlist"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
