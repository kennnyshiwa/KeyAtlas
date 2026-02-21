"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ThreadModerationActionsProps {
  threadId: string;
  categorySlug: string;
  locked: boolean;
  pinned: boolean;
}

export function ThreadModerationActions({
  threadId,
  categorySlug,
  locked,
  pinned,
}: ThreadModerationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function mutate(action: "lock" | "unlock" | "pin" | "unpin") {
    setLoading(action);
    try {
      const res = await fetch(`/api/forums/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          toast.error("Sign in as a moderator to manage threads.");
          router.refresh();
          return;
        }
        if (res.status === 403) {
          toast.error("You don't have permission to moderate this thread.");
          router.refresh();
          return;
        }
        toast.error(err.error || "Failed to update thread");
        return;
      }
      toast.success("Thread updated");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update thread");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this thread and all replies?")) return;
    setLoading("delete");
    try {
      const res = await fetch(`/api/forums/threads/${threadId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          toast.error("Sign in as a moderator to manage threads.");
          router.refresh();
          return;
        }
        if (res.status === 403) {
          toast.error("You don't have permission to moderate this thread.");
          router.refresh();
          return;
        }
        toast.error(err.error || "Failed to delete thread");
        return;
      }
      const json = await res.json();
      toast.success("Thread deleted");
      router.push(`/forums/${json.categorySlug}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete thread");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={loading !== null}
        onClick={() => mutate(locked ? "unlock" : "lock")}
      >
        {locked ? <Unlock className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
        {locked ? "Unlock" : "Lock"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={loading !== null}
        onClick={() => mutate(pinned ? "unpin" : "pin")}
      >
        {pinned ? <PinOff className="mr-1 h-4 w-4" /> : <Pin className="mr-1 h-4 w-4" />}
        {pinned ? "Unpin" : "Pin"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={loading !== null}
        onClick={handleDelete}
      >
        <Trash2 className="mr-1 h-4 w-4" /> Delete
      </Button>
    </div>
  );
}
