"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  projectId: string;
  initialCount?: number;
  initialFavorited?: boolean;
}

export function FavoriteButton({
  projectId,
  initialCount = 0,
  initialFavorited = false,
}: FavoriteButtonProps) {
  const { data: session } = useSession();
  const [count, setCount] = useState(initialCount);
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const lastTouchRef = useRef(0);

  useEffect(() => {
    fetch(`/api/favorites/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setCount(data.count);
        setIsFavorited(data.isFavorited);
      })
      .catch(() => {});
  }, [projectId]);

  async function toggle(e: React.MouseEvent | React.TouchEvent) {
    // Prevent double-fire: if click follows a recent touch, skip it
    if (e.type === "touchend") {
      lastTouchRef.current = Date.now();
      e.preventDefault(); // prevent subsequent click synthesis
    }
    if (e.type === "click" && Date.now() - lastTouchRef.current < 500) {
      return;
    }

    if (!session?.user || isLoading) return;

    const wasFavorited = isFavorited;

    // Optimistic update
    setIsFavorited(!wasFavorited);
    setCount((c) => (wasFavorited ? c - 1 : c + 1));
    setIsLoading(true);

    try {
      const res = await fetch(`/api/favorites/${projectId}`, {
        method: wasFavorited ? "DELETE" : "POST",
      });
      const data = await res.json();
      setCount(data.count);
      setIsFavorited(data.isFavorited);
    } catch {
      // Revert on error
      setIsFavorited(wasFavorited);
      setCount((c) => (wasFavorited ? c + 1 : c - 1));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 touch-manipulation"
      onClick={toggle}
      onTouchEnd={toggle}
      disabled={!session?.user}
    >
      <Heart
        className={cn(
          "h-4 w-4",
          isFavorited && "fill-red-500 text-red-500"
        )}
      />
      {count > 0 && <span className="text-xs">{count}</span>}
    </Button>
  );
}
