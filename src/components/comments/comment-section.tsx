"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import { Separator } from "@/components/ui/separator";

interface CommentUser {
  id: string;
  name: string | null;
  image: string | null;
}

export interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: CommentUser;
  parentId: string | null;
  replies: CommentData[];
}

interface CommentSectionProps {
  projectId: string;
}

export function CommentSection({ projectId }: CommentSectionProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [projectId]);

  const handleDelete = async (commentId: string) => {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchComments();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Comments</h2>

      {session?.user && (
        <>
          <CommentForm projectId={projectId} onSubmitted={fetchComments} />
          <Separator />
        </>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              projectId={projectId}
              currentUserId={session?.user?.id}
              currentUserRole={session?.user?.role}
              onDelete={handleDelete}
              onReplySubmitted={fetchComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
