"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Volume2, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SoundTest {
  id: string;
  title: string | null;
  url: string;
  platform: string | null;
}

interface SoundTestSectionProps {
  projectId: string;
  soundTests: SoundTest[];
  canEdit: boolean;
}

function getEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  // Streamable
  const streamableMatch = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
  if (streamableMatch) return `https://streamable.com/e/${streamableMatch[1]}`;

  return null;
}

function detectPlatform(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("streamable.com")) return "streamable";
  if (url.includes("soundcloud.com")) return "soundcloud";
  return "other";
}

export function SoundTestSection({ projectId, soundTests: initial, canEdit }: SoundTestSectionProps) {
  const [tests, setTests] = useState<SoundTest[]>(initial);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function addSoundTest() {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sound-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          title: newTitle.trim() || null,
          platform: detectPlatform(newUrl),
        }),
      });

      if (!res.ok) {
        toast.error("Failed to add sound test");
        return;
      }

      const data = await res.json();
      setTests((prev) => [...prev, data]);
      setNewUrl("");
      setNewTitle("");
      setShowForm(false);
      toast.success("Sound test added!");
    } catch {
      toast.error("Failed to add sound test");
    } finally {
      setAdding(false);
    }
  }

  async function removeSoundTest(id: string) {
    try {
      await fetch(`/api/projects/${projectId}/sound-tests/${id}`, {
        method: "DELETE",
      });
      setTests((prev) => prev.filter((t) => t.id !== id));
      toast.success("Sound test removed");
    } catch {
      toast.error("Failed to remove sound test");
    }
  }

  if (tests.length === 0 && !canEdit) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Sound Tests
        </CardTitle>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && showForm && (
          <div className="space-y-2 rounded-md border p-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
            />
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="YouTube or Streamable URL"
            />
            <Button onClick={addSoundTest} disabled={adding} size="sm">
              {adding && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Add Sound Test
            </Button>
          </div>
        )}

        {tests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No sound tests yet.{canEdit ? " Add one above!" : ""}
          </p>
        ) : (
          tests.map((test) => {
            const embedUrl = getEmbedUrl(test.url);
            return (
              <div key={test.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {test.title || "Sound Test"}
                  </p>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSoundTest(test.id)}
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  )}
                </div>
                {embedUrl ? (
                  <div className="aspect-video overflow-hidden rounded-md">
                    <iframe
                      src={embedUrl}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={test.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm hover:underline"
                  >
                    {test.url}
                  </a>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
