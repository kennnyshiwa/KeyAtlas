"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface ForumPostFormProps {
  threadId: string;
  categorySlug: string;
  threadSlug: string;
  parentId?: string;
}

export function ForumPostForm({ threadId, categorySlug: _categorySlug, threadSlug: _threadSlug, parentId }: ForumPostFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Reply cannot be empty.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/forums/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to post reply");
        return;
      }

      setContent("");
      toast.success("Reply posted!");
      router.refresh();
    } catch {
      toast.error("Failed to post reply");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Post a Reply
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RichTextEditor content={content} onChange={setContent} />
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post Reply
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
