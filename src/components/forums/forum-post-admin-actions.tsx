"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ForumPostAdminActionsProps {
  postId: string;
}

export function ForumPostAdminActions({ postId }: ForumPostAdminActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this post?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          toast.error("Sign in as a moderator to manage posts.");
          router.refresh();
          return;
        }
        if (res.status === 403) {
          toast.error("You don't have permission to moderate this post.");
          router.refresh();
          return;
        }
        toast.error(err.error || "Failed to delete post");
        return;
      }
      toast.success("Post deleted");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      disabled={loading}
      onClick={handleDelete}
    >
      <Trash2 className="mr-1 h-4 w-4" />
      Delete
    </Button>
  );
}
