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
import { Label } from "@/components/ui/label";
import { Merge, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Designer {
  id: string;
  name: string;
  slug: string;
  _count: { projects: number };
}

interface DesignerMergeDialogProps {
  designers: Designer[];
}

export function DesignerMergeDialog({ designers }: DesignerMergeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const filteredDesigners = designers.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.slug.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSource = (id: string) => {
    if (id === targetId) return;
    setSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleMerge = async () => {
    if (!targetId || sourceIds.length === 0) return;

    const target = designers.find((d) => d.id === targetId);
    const sources = designers.filter((d) => sourceIds.includes(d.id));
    const sourceNames = sources.map((s) => s.name).join(", ");

    if (
      !confirm(
        `Merge ${sources.length} designer(s) (${sourceNames}) into "${target?.name}"?\n\nAll their projects will be reassigned and the merged designers will be deleted. This cannot be undone.`
      )
    )
      return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/designers/merge", {
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
        `Merged ${data.merged.length} designer(s) into "${data.into}" (${data.projectsMoved} projects moved)`
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
          Merge Designers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Merge Designers</DialogTitle>
          <DialogDescription>
            Select a target designer, then check the duplicates to merge into it.
            All projects will be reassigned and duplicates will be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div>
            <input
              type="text"
              placeholder="Search designers..."
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
                {filteredDesigners.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-t ${
                      d.id === targetId
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : sourceIds.includes(d.id)
                          ? "bg-red-50 dark:bg-red-950/30"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="radio"
                        name="target"
                        checked={targetId === d.id}
                        onChange={() => {
                          setTargetId(d.id);
                          setSourceIds((prev) => prev.filter((s) => s !== d.id));
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={sourceIds.includes(d.id)}
                        disabled={d.id === targetId}
                        onChange={() => toggleSource(d.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5">{d.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.slug}</td>
                    <td className="px-3 py-1.5 text-right">{d._count.projects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {targetId && sourceIds.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Will merge{" "}
              <span className="font-medium text-foreground">
                {sourceIds.length} designer(s)
              </span>{" "}
              into{" "}
              <span className="font-medium text-emerald-600">
                {designers.find((d) => d.id === targetId)?.name}
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
