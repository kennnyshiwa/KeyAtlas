"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ImageUpload } from "@/components/shared/image-upload";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DIFFICULTY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"];

interface GuideFormInitialData {
  id: string;
  title: string;
  content: string;
  difficulty: string | null;
  heroImage: string | null;
}

interface GuideFormProps {
  initialData?: GuideFormInitialData;
  mode: "create" | "edit";
}

export function GuideForm({ initialData, mode }: GuideFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [difficulty, setDifficulty] = useState(initialData?.difficulty ?? "");
  const [heroImage, setHeroImage] = useState(initialData?.heroImage ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        content,
        difficulty: difficulty || null,
        heroImage: heroImage || null,
      };

      const url =
        mode === "edit" && initialData
          ? `/api/guides/${initialData.id}`
          : "/api/guides";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err: { error?: string } = await res.json().catch(() => ({}));
        toast.error(err.error || `Failed to ${mode === "edit" ? "update" : "create"} guide`);
        return;
      }

      const data: { slug?: string } = await res.json();

      if (mode === "edit") {
        toast.success("Guide updated!");
        router.push(`/guides/${data.slug}`);
        router.refresh();
      } else {
        toast.success("Guide created! It will be visible once published.");
        router.push(`/guides/${data.slug}`);
      }
    } catch {
      toast.error(`Failed to ${mode === "edit" ? "update" : "create"} guide`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., How to Lube Stabilizers"
              maxLength={200}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <ImageUpload value={heroImage} onChange={setHeroImage} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Guide Content</Label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>

          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Save Changes" : "Create Guide"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
