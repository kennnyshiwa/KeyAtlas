"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// Lazy-loaded Pretext module type
type PretextModule = typeof import("@/lib/pretext/layout");

// Cache to avoid re-importing
let pretextModule: PretextModule | null = null;
let pretextLoadFailed = false;

async function loadPretext(): Promise<PretextModule | null> {
  if (pretextLoadFailed) return null;
  if (pretextModule) return pretextModule;
  try {
    pretextModule = await import("@/lib/pretext/layout");
    return pretextModule;
  } catch {
    pretextLoadFailed = true;
    return null;
  }
}

// Font family must match what CSS renders for h1 on the page.
// The app uses Geist via --font-geist-sans CSS variable.
// We use a fallback chain that matches typical rendering.
const FONT_FAMILY = "Geist, ui-sans-serif, system-ui, sans-serif";

const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 72;
const DEFAULT_FONT_SIZE = 30; // ~text-3xl, close to the original styling
const LINE_HEIGHT_RATIO = 1.1;
// Max height for the headline block — prevents very long titles
// from dominating the page. ~3 lines at 60px ≈ 200px.
const MAX_HEIGHT = 200;

// Simple cache keyed on text + width
let cachedText = "";
let cachedWidth = -1;
let cachedFontSize = DEFAULT_FONT_SIZE;

interface AdaptiveHeadlineProps {
  title: string;
  className?: string;
}

export function AdaptiveHeadline({ title, className }: AdaptiveHeadlineProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [ready, setReady] = useState(false);

  const computeSize = useCallback(async (width: number) => {
    if (width <= 0) return;

    // Use cache if text and width haven't changed
    if (title === cachedText && width === cachedWidth) {
      setFontSize(cachedFontSize);
      setReady(true);
      return;
    }

    const pretext = await loadPretext();
    if (!pretext) {
      setReady(true);
      return;
    }

    let lo = MIN_FONT_SIZE;
    let hi = MAX_FONT_SIZE;
    let best = lo;

    while (lo <= hi) {
      const size = Math.floor((lo + hi) / 2);
      const font = `700 ${size}px ${FONT_FAMILY}`;
      const lineHeight = Math.round(size * LINE_HEIGHT_RATIO);
      const prepared = pretext.prepareWithSegments(title, font);
      let breaksWord = false;
      let lineCount = 0;

      pretext.walkLineRanges(prepared, width, (line) => {
        lineCount++;
        if (line.end.graphemeIndex !== 0) breaksWord = true;
      });

      const totalHeight = lineCount * lineHeight;
      if (!breaksWord && totalHeight <= MAX_HEIGHT) {
        best = size;
        lo = size + 1;
      } else {
        hi = size - 1;
      }
    }

    // Update cache
    cachedText = title;
    cachedWidth = width;
    cachedFontSize = best;

    setFontSize(best);
    setReady(true);
  }, [title]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initial computation
    computeSize(el.clientWidth);

    // Re-compute on resize
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        computeSize(width);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [computeSize]);

  return (
    <h1
      ref={containerRef}
      className={className}
      style={{
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: "-0.025em",
        // Prevent layout shift: use visibility to hide until ready,
        // but keep the element in flow at default size
        opacity: ready ? 1 : 0,
        transition: "opacity 0.15s ease-in",
      }}
    >
      {title}
    </h1>
  );
}
