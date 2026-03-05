"use client";

import { useState } from "react";
import { SmartImage } from "@/components/shared/smart-image";
import { Button } from "@/components/ui/button";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import { CommentForm } from "./comment-form";
import type { CommentData } from "./comment-section";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

interface CommentItemProps {
  comment: CommentData;
  projectId: string;
  currentUserId?: string;
  currentUserRole?: string;
  onDelete: (id: string) => void;
  onReplySubmitted: () => void;
  depth?: number;
}

export function CommentItem({
  comment,
  projectId,
  currentUserId,
  currentUserRole,
  onDelete,
  onReplySubmitted,
  depth = 0,
}: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);

  const isOwner = currentUserId === comment.userId;
  const canDelete = isOwner || currentUserRole === "ADMIN";
  const canEdit = isOwner;
  const canReply = !!currentUserId && depth < 2;

  async function handleSaveEdit() {
    if (!editContent.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update comment");
        return;
      }
      comment.content = editContent;
      setIsEditing(false);
      toast.success("Comment updated");
    } catch {
      toast.error("Failed to update comment");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 pl-4" : ""}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="bg-muted flex h-7 w-7 items-center justify-center overflow-hidden rounded-full">
            {comment.user.image ? (
              <SmartImage
                src={comment.user.image}
                alt={comment.user.name ?? "User"}
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="text-muted-foreground h-4 w-4" />
            )}
          </div>
          <span className="text-sm font-medium">
            {comment.user.name ?? "Anonymous"}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatDate(comment.createdAt)}
          </span>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setIsEditing(false); setEditContent(comment.content); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <RichTextRenderer content={comment.content} />
        )}

        {!isEditing && (
          <div className="flex gap-1">
            {canReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                <MessageSquare className="mr-1 h-3 w-3" />
                Reply
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-500 hover:text-red-600"
                onClick={() => onDelete(comment.id)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            )}
          </div>
        )}

        {showReplyForm && (
          <CommentForm
            projectId={projectId}
            parentId={comment.id}
            onSubmitted={() => {
              setShowReplyForm(false);
              onReplySubmitted();
            }}
            onCancel={() => setShowReplyForm(false)}
          />
        )}
      </div>

      {comment.replies?.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              projectId={projectId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onDelete={onDelete}
              onReplySubmitted={onReplySubmitted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
