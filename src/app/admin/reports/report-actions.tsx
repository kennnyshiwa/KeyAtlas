"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ReportActions({
  reportId,
  status,
  canRestore,
}: {
  reportId: string;
  status: "OPEN" | "NON_ISSUE" | "RESOLVED";
  canRestore: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function resolve(action: "non_issue" | "resolve_delete" | "restore_project") {
    const confirmed =
      action === "resolve_delete"
        ? window.confirm("This will hide the project from public view. Continue?")
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
      if (action === "non_issue") toast.success("Marked as non-issue");
      else if (action === "restore_project") toast.success("Project restored");
      else toast.success("Project hidden & report resolved");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-2">
      {status === "OPEN" && (
        <>
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
            Hide project
          </Button>
        </>
      )}
      {status === "RESOLVED" && canRestore && (
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => resolve("restore_project")}
        >
          Restore project
        </Button>
      )}
    </div>
  );
}
