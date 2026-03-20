"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/shared/image-upload";
import { generateSlug } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OwnerPicker } from "@/components/admin/owner-picker";
import type { DesignerFormData } from "@/lib/validations/designer";

interface DesignerFormProps {
  designer?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    banner: string | null;
    description: string | null;
    websiteUrl: string | null;
    ownerId?: string | null;
    owner?: { username: string | null; name: string | null } | null;
  };
  isAdmin?: boolean;
}

export function DesignerForm({ designer, isAdmin }: DesignerFormProps) {
  const router = useRouter();
  const isEditing = !!designer;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(designer?.ownerId ?? null);

  const [formData, setFormData] = useState<DesignerFormData>({
    name: designer?.name ?? "",
    slug: designer?.slug ?? "",
    logo: designer?.logo ?? null,
    banner: designer?.banner ?? null,
    description: designer?.description ?? "",
    websiteUrl: designer?.websiteUrl ?? "",
  });

  const updateField = <K extends keyof DesignerFormData>(
    key: K,
    value: DesignerFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (name: string) => {
    updateField("name", name);
    if (!isEditing) {
      updateField("slug", generateSlug(name));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = isEditing
        ? `/api/designers/${designer.id}`
        : "/api/designers";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, ...(isAdmin ? { ownerId } : {}) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save designer");
      }

      toast.success(isEditing ? "Designer updated" : "Designer created");
      router.push("/admin/designers");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Designer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => updateField("slug", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              value={formData.websiteUrl ?? ""}
              onChange={(e) => updateField("websiteUrl", e.target.value || null)}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description ?? ""}
              onChange={(e) => updateField("description", e.target.value || null)}
              placeholder="Describe this designer..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUpload
            value={formData.logo ?? undefined}
            onChange={(url) => updateField("logo", url)}
            onRemove={() => updateField("logo", null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Banner</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUpload
            value={formData.banner ?? undefined}
            onChange={(url) => updateField("banner", url)}
            onRemove={() => updateField("banner", null)}
          />
        </CardContent>
      </Card>

      {isAdmin && (
        <OwnerPicker
          ownerId={ownerId}
          ownerName={designer?.owner?.username || designer?.owner?.name}
          onChange={setOwnerId}
        />
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Designer" : "Create Designer"}
        </Button>
      </div>
    </form>
  );
}
