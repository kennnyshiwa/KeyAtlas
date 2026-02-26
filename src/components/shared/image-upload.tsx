"use client";

import { useState, useCallback, useId } from "react";
import { Upload, X, ImageIcon, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/shared/smart-image";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  className,
}: ImageUploadProps) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const inputId = useId();

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Upload failed");
        }
        onChange(data.url);
      } catch (error) {
        console.error("Upload error:", error);
        const message = error instanceof Error ? error.message : "Upload failed";
        setUrlError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleUrlSubmit = useCallback(async () => {
    setUrlError("");
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setIsValidating(true);
    try {
      const res = await fetch("/api/validate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setUrlError(data.error || "Invalid image URL");
        return;
      }

      onChange(data.url);
      setUrlInput("");
    } catch {
      setUrlError("Failed to validate URL");
    } finally {
      setIsValidating(false);
    }
  }, [urlInput, onChange]);

  if (value) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border", className)}>
        <SmartImage
          src={value}
          alt="Uploaded image"
          width={400}
          height={300}
          className="h-48 w-full object-cover"
        />
        {onRemove && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={onRemove}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-1">
        <Button
          type="button"
          variant={mode === "upload" ? "default" : "outline"}
          size="sm"
          onClick={() => { setMode("upload"); setUrlError(""); }}
        >
          <Upload className="mr-1 h-3 w-3" />
          Upload
        </Button>
        <Button
          type="button"
          variant={mode === "url" ? "default" : "outline"}
          size="sm"
          onClick={() => { setMode("url"); setUrlError(""); }}
        >
          <LinkIcon className="mr-1 h-3 w-3" />
          Image URL
        </Button>
      </div>

      {mode === "upload" ? (
        <>
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {isUploading ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-sm">Uploading...</span>
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-2">
                {isDragging ? (
                  <ImageIcon className="h-8 w-8" />
                ) : (
                  <Upload className="h-8 w-8" />
                )}
                <span className="text-sm">
                  {isDragging ? "Drop image here" : "Click or drag to upload"}
                </span>
                <span className="text-xs">PNG, JPG, WebP, GIF, AVIF up to 15MB</span>
              </div>
            )}
          </div>
          {urlError && <p className="text-destructive text-sm">{urlError}</p>}
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="https://i.imgur.com/example.jpg"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleUrlSubmit();
                }
              }}
            />
            <Button
              type="button"
              onClick={handleUrlSubmit}
              disabled={isValidating || !urlInput.trim()}
            >
              {isValidating ? "Checking..." : "Add"}
            </Button>
          </div>
          {urlError && (
            <p className="text-destructive text-sm">{urlError}</p>
          )}
          <p className="text-muted-foreground text-xs">
            Paste any direct image URL (PNG, JPG, WebP, GIF, AVIF, SVG)
          </p>
        </div>
      )}
    </div>
  );
}
