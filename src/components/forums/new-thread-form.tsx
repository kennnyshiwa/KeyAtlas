"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NewThreadFormProps {
  categoryId: string;
  categorySlug: string;
}

export function NewThreadForm({ categoryId, categorySlug }: NewThreadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/forums/${categorySlug}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create thread");
        return;
      }

      const data = await res.json();
      toast.success("Thread created!");
      router.push(`/forums/${categorySlug}/${data.slug}`);
    } catch {
      toast.error("Failed to create thread");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Thread Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to discuss?"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Content</Label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Thread
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
