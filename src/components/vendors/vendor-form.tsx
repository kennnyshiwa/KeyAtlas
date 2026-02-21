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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { VendorFormData } from "@/lib/validations/vendor";

interface VendorFormProps {
  vendor?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    description: string | null;
    storefrontUrl: string | null;
    verified: boolean;
    regionsServed: string[];
  };
}

export function VendorForm({ vendor }: VendorFormProps) {
  const router = useRouter();
  const isEditing = !!vendor;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regionInput, setRegionInput] = useState("");

  const [formData, setFormData] = useState<VendorFormData>({
    name: vendor?.name ?? "",
    slug: vendor?.slug ?? "",
    logo: vendor?.logo ?? null,
    description: vendor?.description ?? "",
    storefrontUrl: vendor?.storefrontUrl ?? "",
    verified: vendor?.verified ?? false,
    regionsServed: vendor?.regionsServed ?? [],
  });

  const updateField = <K extends keyof VendorFormData>(
    key: K,
    value: VendorFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (name: string) => {
    updateField("name", name);
    if (!isEditing) {
      updateField("slug", generateSlug(name));
    }
  };

  const addRegion = () => {
    const region = regionInput.trim().toUpperCase();
    if (region && !formData.regionsServed.includes(region)) {
      updateField("regionsServed", [...formData.regionsServed, region]);
      setRegionInput("");
    }
  };

  const removeRegion = (region: string) => {
    updateField(
      "regionsServed",
      formData.regionsServed.filter((r) => r !== region)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = isEditing
        ? `/api/vendors/${vendor.id}`
        : "/api/vendors";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save vendor");
      }

      toast.success(isEditing ? "Vendor updated" : "Vendor created");
      router.push("/admin/vendors");
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
          <CardTitle>Vendor Information</CardTitle>
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
            <Label htmlFor="storefrontUrl">Storefront URL</Label>
            <Input
              id="storefrontUrl"
              value={formData.storefrontUrl ?? ""}
              onChange={(e) => updateField("storefrontUrl", e.target.value || null)}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description ?? ""}
              onChange={(e) => updateField("description", e.target.value || null)}
              placeholder="Describe this vendor..."
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.verified}
              onChange={(e) => updateField("verified", e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Verified vendor</span>
          </label>
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
          <CardTitle>Regions Served</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. NA, EU, ASIA"
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRegion();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addRegion}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          {formData.regionsServed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.regionsServed.map((region) => (
                <span
                  key={region}
                  className="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                >
                  {region}
                  <button type="button" onClick={() => removeRegion(region)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
          {isEditing ? "Update Vendor" : "Create Vendor"}
        </Button>
      </div>
    </form>
  );
}
