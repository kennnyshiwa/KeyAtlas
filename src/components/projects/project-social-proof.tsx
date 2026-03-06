"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FollowButton } from "@/components/social/follow-button";

interface ProjectSocialProofProps {
  projectId: string;
  followerCount: number;
  favoriteCount: number;
  commentCount: number;
  canFollow: boolean;
  initialFollowing: boolean;
}

export function ProjectSocialProof({
  projectId,
  followerCount,
  favoriteCount,
  commentCount,
  canFollow,
  initialFollowing,
}: ProjectSocialProofProps) {
  const [followers, setFollowers] = useState(followerCount);
  const [following, setFollowing] = useState(initialFollowing);

  const handleFollowingChange = (nextFollowing: boolean) => {
    if (nextFollowing === following) return;
    setFollowers((current) => Math.max(0, current + (nextFollowing ? 1 : -1)));
    setFollowing(nextFollowing);
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{followers} followers</Badge>
        <Badge variant="secondary">{favoriteCount} bookmarks</Badge>
        <Badge variant="secondary">{commentCount} comments</Badge>
        {canFollow ? (
          <FollowButton
            targetType="PROJECT"
            targetId={projectId}
            initialFollowing={initialFollowing}
            onFollowingChange={handleFollowingChange}
            size="sm"
          />
        ) : null}
      </div>
    </div>
  );
}
