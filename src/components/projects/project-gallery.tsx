"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ProjectImage } from "@/generated/prisma";

interface ProjectGalleryProps {
  images: ProjectImage[];
}

export function ProjectGallery({ images }: ProjectGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sorted = [...images].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Gallery</h2>
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
        <Image
          src={sorted[selectedIndex].url}
          alt={sorted[selectedIndex].alt ?? "Project image"}
          fill
          className="object-cover"
          sizes="(max-width: 1200px) 100vw, 800px"
        />
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
              <Image
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
