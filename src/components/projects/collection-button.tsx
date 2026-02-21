"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectionButtonProps {
  projectId: string;
}

export function CollectionButton({ projectId }: CollectionButtonProps) {
  const { data: session } = useSession();
  const [isCollected, setIsCollected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/collections/${projectId}`)
      .then((r) => r.json())
      .then((data) => setIsCollected(data.isCollected))
      .catch(() => {});
  }, [projectId, session?.user]);

  const toggle = async () => {
    if (!session?.user || isLoading) return;

    setIsCollected(!isCollected);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/collections/${projectId}`, {
        method: isCollected ? "DELETE" : "POST",
      });
      const data = await res.json();
      setIsCollected(data.isCollected);
    } catch {
      setIsCollected(isCollected);
    } finally {
      setIsLoading(false);
    }
  };

  if (!session?.user) return null;

  return (
    <Button
      variant={isCollected ? "default" : "outline"}
      size="sm"
      className="gap-1.5"
      onClick={toggle}
    >
      <Package
        className={cn("h-4 w-4", isCollected && "fill-current")}
      />
      {isCollected ? "In Collection" : "Add to Collection"}
    </Button>
  );
}
