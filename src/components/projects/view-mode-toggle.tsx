"use client";

import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List, Image, Columns3 } from "lucide-react";

export type ViewMode = "card" | "compact" | "image" | "masonry";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as ViewMode);
      }}
    >
      <ToggleGroupItem value="card" aria-label="Card view">
        <LayoutGrid className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="masonry" aria-label="Masonry view">
        <Columns3 className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="compact" aria-label="Compact view">
        <List className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="image" aria-label="Image view">
        <Image className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
