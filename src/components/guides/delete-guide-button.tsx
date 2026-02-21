"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteGuideButtonProps {
  guideId: string;
}

export function DeleteGuideButton({ guideId }: DeleteGuideButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    const confirmed = window.confirm(
      "Delete this guide? This action cannot be undone."
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/guides/${guideId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete guide");
        return;
      }

      router.push("/guides");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={onDelete} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="mr-2 h-4 w-4" />
      )}
      Delete Guide
    </Button>
  );
}
