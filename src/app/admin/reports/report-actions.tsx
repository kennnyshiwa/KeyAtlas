"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ReportActions({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function resolve(action: "non_issue" | "resolve_delete") {
    const confirmed =
      action === "resolve_delete"
        ? window.confirm("This will permanently delete the reported project. Continue?")
        : true;
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed");
        return;
      }
      toast.success(action === "non_issue" ? "Marked as non-issue" : "Project removed & report resolved");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => resolve("non_issue")}
      >
        Non-issue
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={loading}
        onClick={() => resolve("resolve_delete")}
      >
        Remove project
      </Button>
    </div>
  );
}
