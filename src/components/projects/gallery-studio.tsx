"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SmartImage } from "@/components/shared/smart-image";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ImagePlus, Link, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

type GalleryImage = {
  url: string;
  alt?: string;
  order: number;
  linkUrl?: string | null;
  openInNewTab: boolean;
};

interface GalleryStudioProps {
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
}

const normalize = (images: GalleryImage[]) =>
  images.map((image, index) => ({ ...image, order: index }));

export function GalleryStudio({ images, onChange }: GalleryStudioProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [urlListInput, setUrlListInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingUrls, setIsAddingUrls] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasImages = images.length > 0;
  const selectedImage = hasImages ? images[Math.min(selectedIndex, images.length - 1)] : null;

  useEffect(() => {
    if (!hasImages) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex > images.length - 1) {
      setSelectedIndex(images.length - 1);
    }
  }, [hasImages, images.length, selectedIndex]);

  const apply = (nextImages: GalleryImage[], nextSelectedIndex?: number) => {
    onChange(normalize(nextImages));
    if (typeof nextSelectedIndex === "number") {
      setSelectedIndex(nextSelectedIndex);
    }
  };

  const addImage = (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    const nextImages = [
      ...images,
      {
        url: cleanUrl,
        alt: "",
        order: images.length,
        linkUrl: null,
        openInNewTab: true,
      },
    ];

    apply(nextImages, nextImages.length - 1);
  };

  const validateImageUrl = async (rawUrl: string): Promise<string | null> => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    const res = await fetch("/api/validate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Could not add ${trimmed}`);
    }

    return data.url;
  };

  const handleAddSingleUrl = async () => {
    if (!urlInput.trim()) return;
    setIsAddingUrls(true);
    try {
      const validated = await validateImageUrl(urlInput);
      if (validated) addImage(validated);
      setUrlInput("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid image URL");
    } finally {
      setIsAddingUrls(false);
    }
  };

  const handleAddUrlList = async () => {
    const entries = urlListInput
      .split(/\r?\n|,/) 
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (entries.length === 0) return;

    setIsAddingUrls(true);
    try {
      const validatedUrls: string[] = [];
      for (const entry of entries) {
        const url = await validateImageUrl(entry);
        if (url) validatedUrls.push(url);
      }

      if (validatedUrls.length > 0) {
        const nextImages = [
          ...images,
          ...validatedUrls.map((url, index) => ({
            url,
            alt: "",
            order: images.length + index,
            linkUrl: null,
            openInNewTab: true,
          })),
        ];
        apply(nextImages, nextImages.length - 1);
        setUrlListInput("");
      }

      toast.success(`Added ${validatedUrls.length} image${validatedUrls.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "One or more URLs could not be validated");
    } finally {
      setIsAddingUrls(false);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploaded: string[] = [];

      for (const file of files) {
        const body = new FormData();
        body.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `Upload failed for ${file.name}`);
        }
        uploaded.push(data.url);
      }

      const nextImages = [
        ...images,
        ...uploaded.map((url, index) => ({
          url,
          alt: "",
          order: images.length + index,
          linkUrl: null,
          openInNewTab: true,
        })),
      ];

      apply(nextImages, nextImages.length - 1);
      toast.success(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateSelectedImage = (patch: Partial<GalleryImage>) => {
    if (!selectedImage) return;
    const nextImages = [...images];
    nextImages[selectedIndex] = { ...selectedImage, ...patch };
    apply(nextImages);
  };

  const removeSelected = () => {
    if (!selectedImage) return;
    const nextImages = images.filter((_, index) => index !== selectedIndex);
    apply(nextImages, Math.max(0, selectedIndex - 1));
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selectedImage) return;
    const destination = selectedIndex + direction;
    if (destination < 0 || destination > images.length - 1) return;

    const next = [...images];
    const [moved] = next.splice(selectedIndex, 1);
    next.splice(destination, 0, moved);
    apply(next, destination);
  };

  const thumbnailLabel = useMemo(
    () => images.map((image, index) => image.alt?.trim() || `Image ${index + 1}`),
    [images]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="gallery-url">Add image URL</Label>
          <div className="flex gap-2">
            <Input
              id="gallery-url"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://example.com/keyboard-render.jpg"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddSingleUrl();
                }
              }}
            />
            <Button type="button" variant="outline" disabled={isAddingUrls || !urlInput.trim()} onClick={handleAddSingleUrl}>
              <Link className="mr-1 h-4 w-4" />
              Add URL
            </Button>
          </div>
        </div>

        <div className="flex items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="mr-1 h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload images"}
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="gallery-bulk-urls">Paste multiple image URLs (comma or line-separated)</Label>
        <Textarea
          id="gallery-bulk-urls"
          value={urlListInput}
          onChange={(event) => setUrlListInput(event.target.value)}
          rows={3}
          placeholder="https://example.com/one.jpg\nhttps://example.com/two.jpg"
        />
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">Tip: use this for quick imports from albums or forum posts.</p>
          <Button type="button" variant="secondary" disabled={isAddingUrls || !urlListInput.trim()} onClick={handleAddUrlList}>
            <ImagePlus className="mr-1 h-4 w-4" />
            Add all
          </Button>
        </div>
      </div>

      {!hasImages ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <ImagePlus className="h-8 w-8" />
          <p className="font-medium text-foreground">No gallery images yet</p>
          <p className="max-w-md text-sm">
            Upload files or paste image URLs to build your gallery. Select any thumbnail to edit alt text and link metadata.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Thumbnails</p>
            <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
              {images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full rounded-md border p-1 text-left transition",
                    index === selectedIndex ? "border-primary ring-primary/20 ring-2" : "hover:border-primary/50"
                  )}
                >
                  <SmartImage src={image.url} alt={image.alt || `Gallery image ${index + 1}`} width={180} height={120} className="h-20 w-full rounded object-cover" />
                  <p className="mt-1 truncate text-xs text-muted-foreground">{thumbnailLabel[index]}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3" onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setSelectedIndex((prev) => Math.max(0, prev - 1));
            if (event.key === "ArrowRight") setSelectedIndex((prev) => Math.min(images.length - 1, prev + 1));
          }} tabIndex={0}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))} disabled={selectedIndex === 0}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground text-xs">{selectedIndex + 1} / {images.length}</span>
                <Button type="button" variant="outline" size="icon" onClick={() => setSelectedIndex((prev) => Math.min(images.length - 1, prev + 1))} disabled={selectedIndex === images.length - 1}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {selectedImage && (
              <SmartImage
                src={selectedImage.url}
                alt={selectedImage.alt || `Gallery image ${selectedIndex + 1}`}
                width={1200}
                height={800}
                className="h-[360px] w-full rounded-md border object-cover"
              />
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Selected image details</p>
            {selectedImage && (
              <>
                <div className="space-y-1">
                  <Label>Alt text</Label>
                  <Input
                    value={selectedImage.alt ?? ""}
                    onChange={(event) => updateSelectedImage({ alt: event.target.value })}
                    placeholder="Describe this image"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Image link URL (optional)</Label>
                  <Input
                    value={selectedImage.linkUrl ?? ""}
                    onChange={(event) => updateSelectedImage({ linkUrl: event.target.value.trim() || null })}
                    placeholder="https://example.com"
                  />
                </div>

                <label className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={selectedImage.openInNewTab ?? true}
                    onChange={(event) => updateSelectedImage({ openInNewTab: event.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Open image link in new tab</span>
                </label>

                <p className="text-muted-foreground text-xs">
                  Caption is not supported by the current backend schema, so alt text is used for accessibility and display hints.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => moveSelected(-1)} disabled={selectedIndex === 0}>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => moveSelected(1)}
                    disabled={selectedIndex === images.length - 1}
                  >
                    <ChevronDown className="mr-1 h-4 w-4" />
                    Move down
                  </Button>
                </div>

                <Button type="button" variant="destructive" onClick={removeSelected}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove image
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
