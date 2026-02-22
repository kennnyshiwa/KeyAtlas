"use client";

import { useState } from "react";
import { SmartImage } from "@/components/shared/smart-image";
import { cn } from "@/lib/utils";
import type { ProjectImage } from "@/generated/prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProjectGalleryProps {
  images: ProjectImage[];
}

export function ProjectGallery({ images }: ProjectGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sorted = [...images].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) return null;

  const selected = sorted[selectedIndex];

  const goPrev = () => {
    setSelectedIndex((prev) => (prev - 1 + sorted.length) % sorted.length);
  };

  const goNext = () => {
    setSelectedIndex((prev) => (prev + 1) % sorted.length);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Gallery</h2>
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
        {selected.linkUrl ? (
          <a
            href={selected.linkUrl}
            target={selected.openInNewTab ? "_blank" : undefined}
            rel={selected.openInNewTab ? "noopener noreferrer" : undefined}
            className="block h-full w-full"
          >
            <SmartImage
              src={selected.url}
              alt={selected.alt ?? "Project image"}
              fill
              className="object-cover"
              sizes="(max-width: 1200px) 100vw, 800px"
            />
          </a>
        ) : (
          <SmartImage
            src={selected.url}
            alt={selected.alt ?? "Project image"}
            fill
            className="object-cover"
            sizes="(max-width: 1200px) 100vw, 800px"
          />
        )}

        {sorted.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {sorted.map((image, i) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === selectedIndex
                  ? "border-primary"
                  : "border-transparent opacity-70 hover:opacity-100"
              )}
            >
              <SmartImage
                src={image.url}
                alt={image.alt ?? "Thumbnail"}
                fill
                className="object-cover"
                sizes="96px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
