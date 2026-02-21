"use client";

import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const RichTextEditor = lazy(() =>
  import("@/components/editor/rich-text-editor").then((m) => ({
    default: m.RichTextEditor,
  }))
);

interface UpdateFormProps {
  projectId: string;
  update?: { id: string; title: string; content: string };
  onSubmitted: () => void;
  onCancel: () => void;
}

export function UpdateForm({
  projectId,
  update,
  onSubmitted,
  onCancel,
}: UpdateFormProps) {
  const [title, setTitle] = useState(update?.title ?? "");
  const [content, setContent] = useState(update?.content ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      const url = update
        ? `/api/updates/${update.id}`
        : `/api/projects/${projectId}/updates`;
      const method = update ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      if (!res.ok) throw new Error("Failed to save update");

      toast.success(update ? "Update edited" : "Update posted");
      onSubmitted();
    } catch {
      toast.error("Failed to save update");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="update-title">Title</Label>
            <Input
              id="update-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Update title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Content</Label>
            <Suspense
              fallback={
                <div className="border-input h-[120px] animate-pulse rounded-md border" />
              }
            >
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="Write your update..."
              />
            </Suspense>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              {update ? "Save" : "Post Update"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
