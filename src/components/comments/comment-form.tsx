"use client";

import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const RichTextEditor = lazy(() =>
  import("@/components/editor/rich-text-editor").then((m) => ({
    default: m.RichTextEditor,
  }))
);

interface CommentFormProps {
  projectId: string;
  parentId?: string;
  onSubmitted: () => void;
  onCancel?: () => void;
}

export function CommentForm({
  projectId,
  parentId,
  onSubmitted,
  onCancel,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content === "<p></p>") return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId: parentId ?? null }),
      });

      if (!res.ok) throw new Error("Failed to post comment");

      setContent("");
      onSubmitted();
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Suspense
        fallback={
          <div className="border-input h-[120px] animate-pulse rounded-md border" />
        }
      >
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder={parentId ? "Write a reply..." : "Write a comment..."}
          toolbarExtra={({ editor }) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const url = window.prompt("Paste image URL (https://...)");
                if (!url) return;
                const trimmed = url.trim();
                if (!/^https?:\/\//i.test(trimmed)) {
                  toast.error("Please enter a valid image URL starting with http:// or https://");
                  return;
                }
                editor.chain().focus().setImage({ src: trimmed }).run();
              }}
            >
              <ImagePlus className="mr-1 h-4 w-4" />
              Image URL
            </Button>
          )}
        />
      </Suspense>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
