"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UpdateForm } from "./update-form";
import { UpdateCard } from "./update-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ProjectUpdateData {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface UpdateTimelineProps {
  projectId: string;
  creatorId: string;
}

export function UpdateTimeline({ projectId, creatorId }: UpdateTimelineProps) {
  const { data: session } = useSession();
  const [updates, setUpdates] = useState<ProjectUpdateData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isCreatorOrAdmin =
    session?.user?.id === creatorId || session?.user?.role === "ADMIN";

  const fetchUpdates = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/updates`);
      if (res.ok) setUpdates(await res.json());
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, [projectId]);

  const handleDelete = async (updateId: string) => {
    const res = await fetch(`/api/updates/${updateId}`, {
      method: "DELETE",
    });
    if (res.ok) fetchUpdates();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Updates</h2>
        {isCreatorOrAdmin && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" />
            Post Update
          </Button>
        )}
      </div>

      {showForm && (
        <UpdateForm
          projectId={projectId}
          onSubmitted={() => {
            setShowForm(false);
            fetchUpdates();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading updates...</p>
      ) : updates.length === 0 ? (
        <p className="text-muted-foreground text-sm">No updates posted yet.</p>
      ) : (
        <div className="space-y-4">
          {updates.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              canEdit={isCreatorOrAdmin}
              onDeleted={() => handleDelete(update.id)}
              onUpdated={fetchUpdates}
            />
          ))}
        </div>
      )}
    </div>
  );
}
