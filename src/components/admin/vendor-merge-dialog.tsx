"use client";

import { useState } from "react";
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

interface Vendor {
  id: string;
  name: string;
  slug: string;
  _count: { projects: number; projectVendors: number };
}

interface VendorMergeDialogProps {
  vendors: Vendor[];
}

export function VendorMergeDialog({ vendors }: VendorMergeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const filteredVendors = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.slug.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSource = (id: string) => {
    if (id === targetId) return;
    setSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleMerge = async () => {
    if (!targetId || sourceIds.length === 0) return;

    const target = vendors.find((v) => v.id === targetId);
    const sources = vendors.filter((v) => sourceIds.includes(v.id));
    const sourceNames = sources.map((s) => s.name).join(", ");

    if (
      !confirm(
        `Merge ${sources.length} vendor(s) (${sourceNames}) into "${target?.name}"?\n\nAll their projects and followers will be reassigned and the merged vendors will be deleted. This cannot be undone.`
      )
    )
      return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendors/merge", {
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
        `Merged ${data.merged.length} vendor(s) into "${data.into}" (${data.projectsMoved} projects moved)`
      );
      setOpen(false);
      setTargetId("");
      setSourceIds([]);
      setSearch("");
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
          Merge Vendors
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Merge Vendors</DialogTitle>
          <DialogDescription>
            Select a target vendor, then check the duplicates to merge into it.
            All projects and followers will be reassigned and duplicates will be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div>
            <input
              type="text"
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md">
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
                {filteredVendors.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-t ${
                      v.id === targetId
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : sourceIds.includes(v.id)
                          ? "bg-red-50 dark:bg-red-950/30"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="radio"
                        name="target"
                        checked={targetId === v.id}
                        onChange={() => {
                          setTargetId(v.id);
                          setSourceIds((prev) => prev.filter((s) => s !== v.id));
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={sourceIds.includes(v.id)}
                        disabled={v.id === targetId}
                        onChange={() => toggleSource(v.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5">{v.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{v.slug}</td>
                    <td className="px-3 py-1.5 text-right">
                      {v._count.projects + v._count.projectVendors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {targetId && sourceIds.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Will merge{" "}
              <span className="font-medium text-foreground">
                {sourceIds.length} vendor(s)
              </span>{" "}
              into{" "}
              <span className="font-medium text-emerald-600">
                {vendors.find((v) => v.id === targetId)?.name}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!targetId || sourceIds.length === 0 || submitting}
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
