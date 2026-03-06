"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FollowButtonProps {
  targetType: "USER" | "PROJECT" | "VENDOR" | "FORUM_THREAD" | "FORUM_CATEGORY";
  targetId: string;
  initialFollowing: boolean;
  onFollowingChange?: (following: boolean) => void;
  size?: "sm" | "default";
}

export function FollowButton({
  targetType,
  targetId,
  initialFollowing,
  onFollowingChange,
  size = "default",
}: FollowButtonProps) {
  const { data: session } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const lastTouchRef = useRef(0);

  // Fetch actual follow state client-side to handle mobile session issues
  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/follow/status?targetType=${targetType}&targetId=${targetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setFollowing(data.following);
          onFollowingChange?.(data.following);
        }
      })
      .catch(() => {});
  }, [session?.user, targetType, targetId, onFollowingChange]);

  async function handleToggle(e: React.MouseEvent | React.TouchEvent) {
    // Prevent double-fire: if click follows a recent touch, skip it
    if (e.type === "touchend") {
      lastTouchRef.current = Date.now();
      e.preventDefault(); // prevent subsequent click synthesis
    }
    if (e.type === "click" && Date.now() - lastTouchRef.current < 500) {
      return;
    }

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
      onFollowingChange?.(data.following);
      if (targetType === "PROJECT" && data.following) {
        toast.success(
          "Following. You'll get updates for status changes, GB ending soon, and shipping progress."
        );
      }
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
      onTouchEnd={handleToggle}
      disabled={loading || !session?.user}
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
