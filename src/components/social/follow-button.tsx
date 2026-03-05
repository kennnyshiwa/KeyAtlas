"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FollowButtonProps {
  targetType: "USER" | "PROJECT" | "VENDOR" | "FORUM_THREAD" | "FORUM_CATEGORY";
  targetId: string;
  initialFollowing: boolean;
  size?: "sm" | "default";
}

export function FollowButton({
  targetType,
  targetId,
  initialFollowing,
  size = "default",
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update follow");
        return;
      }

      const data = await res.json();
      setFollowing(data.following);
    } catch {
      toast.error("Failed to update follow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={following ? "outline" : "default"}
      size={size}
      className="touch-manipulation"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : following ? (
        <UserCheck className="mr-2 h-4 w-4" />
      ) : (
        <UserPlus className="mr-2 h-4 w-4" />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
