"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface ProjectSocialProofProps {
  projectId: string;
  followerCount: number;
  favoriteCount: number;
  commentCount: number;
  initialFollowing: boolean;
}

export function ProjectSocialProof({
  projectId,
  followerCount,
  favoriteCount,
  commentCount,
  initialFollowing,
}: ProjectSocialProofProps) {
  const [followers, setFollowers] = useState(followerCount);
  const [following, setFollowing] = useState(initialFollowing);

  useEffect(() => {
    const onFollowChanged = (event: Event) => {
      const custom = event as CustomEvent<{ targetId: string; following: boolean }>;
      if (!custom.detail || custom.detail.targetId !== projectId) return;

      const nextFollowing = custom.detail.following;
      setFollowers((current) => {
        if (nextFollowing === following) return current;
        return Math.max(0, current + (nextFollowing ? 1 : -1));
      });
      setFollowing(nextFollowing);
    };

    window.addEventListener("project-follow-changed", onFollowChanged as EventListener);
    return () => window.removeEventListener("project-follow-changed", onFollowChanged as EventListener);
  }, [projectId, following]);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{followers} followers</Badge>
        <Badge variant="secondary">{favoriteCount} bookmarks</Badge>
        <Badge variant="secondary">{commentCount} comments</Badge>
      </div>
    </div>
  );
}
