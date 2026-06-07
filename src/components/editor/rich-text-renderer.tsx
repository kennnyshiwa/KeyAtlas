"use client";

import sanitizeHtml from "sanitize-html";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

interface RichTextRendererProps {
  content: string;
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
}

function fontSizeFromLegacyFontTag(size?: string) {
  if (!size) return undefined;
  const raw = String(size).trim();
  const map: Record<string, string> = {
    "1": "10px",
    "2": "13px",
    "3": "16px",
    "4": "18px",
    "5": "24px",
    "6": "32px",
    "7": "48px",
  };
  if (map[raw]) return map[raw];
  if (/^\d+(?:\.\d+)?(?:px|pt|rem|em|%)$/i.test(raw)) return raw;
  return undefined;
}

function mergeClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").trim();
}

function createSanitizeOptions(): sanitizeHtml.IOptions {
  let imageIndex = 0;

  return {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "p",
      "br",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "span",
      "div",
      "figure",
      "figcaption",
      "img",
      "font",
      "details",
      "summary",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "style", "class", "data-mention"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      div: ["style", "align", "class", "data-collapsible-content"],
      span: ["style"],
      li: ["style"],
      blockquote: ["style"],
      strong: ["style"],
      em: ["style"],
      figure: ["style", "class"],
      figcaption: ["style", "class"],
      img: ["src", "alt", "loading", "decoding", "fetchpriority", "width", "height", "style", "class", "data-rt-image"],
      details: ["open", "class", "data-collapsible"],
      summary: ["class"],
    },
    allowedStyles: {
      "*": {
        color: [
          /^#[0-9a-fA-F]{3,6}$/,
          /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/,
          /^[a-zA-Z]+$/,
        ],
        "font-size": [/^\d+(?:\.\d+)?(?:px|pt|rem|em|%)$/],
        "text-align": [/^(left|center|right)$/],
        margin: [/^\d+(?:\.\d+)?(?:px|rem|em|%)?(?:\s+\d+(?:\.\d+)?(?:px|rem|em|%)?){0,3}$/],
        "margin-top": [/^\d+(?:\.\d+)?(?:px|rem|em|%)$/],
        "max-width": [/^\d+(?:\.\d+)?(?:px|rem|em|%)$|^100%$/],
        width: [/^\d+(?:\.\d+)?(?:px|rem|em|%)$|^100%$/],
        height: [/^\d+(?:\.\d+)?(?:px|rem|em|%)$|^auto$/],
        display: [/^(block|inline|inline-block)$/],
        "border-radius": [/^\d+(?:\.\d+)?(?:px|rem|em|%)$/],
      },
    },
    transformTags: {
      font: (_tagName, attribs) => {
        const styleParts: string[] = [];
        if (attribs.color) styleParts.push(`color:${attribs.color}`);
        const size = fontSizeFromLegacyFontTag(attribs.size);
        if (size) styleParts.push(`font-size:${size}`);
        if (attribs.style) styleParts.push(attribs.style);

        return {
          tagName: "span",
          attribs: {
            style: styleParts.join(";"),
          },
        };
      },
      img: (_tagName, attribs) => {
        const style = attribs.style || "";
        const hasMaxWidth = /max-width\s*:/i.test(style);
        const hasHeight = /height\s*:/i.test(style);
        const hasDisplay = /display\s*:/i.test(style);
        const isPriorityImage = imageIndex === 0;
        imageIndex += 1;
        const normalizedStyle = [
          style,
          hasMaxWidth ? "" : "max-width:100%",
          hasHeight ? "" : "height:auto",
          hasDisplay ? "" : "display:block",
        ]
          .filter(Boolean)
          .join(";");

        return {
          tagName: "img",
          attribs: {
            ...attribs,
            class: mergeClasses(attribs.class, "rt-inline-image", "rt-inline-image--loading"),
            loading: attribs.loading || (isPriorityImage ? "eager" : "lazy"),
            decoding: attribs.decoding || "async",
            fetchpriority: attribs.fetchpriority || (isPriorityImage ? "high" : "auto"),
            style: normalizedStyle,
            "data-rt-image": "true",
          },
        };
      },
      details: (_tagName, attribs) => ({
        tagName: "details",
        attribs: {
          ...attribs,
          class: mergeClasses(attribs.class, "ka-collapsible-section"),
          "data-collapsible": attribs["data-collapsible"] || "true",
        },
      }),
      summary: (_tagName, attribs) => ({
        tagName: "summary",
        attribs: {
          ...attribs,
          class: mergeClasses(attribs.class, "ka-collapsible-summary"),
        },
      }),
    },
    allowedSchemes: ["http", "https"],
  };
}

export function preserveEmptyParagraphSpacing(html: string) {
  return html.replace(/<p([^>]*)>(?:\s|&nbsp;|<span[^>]*>\s*<\/span>)*<\/p>/gi, '<p$1><br /></p>');
}

export function sanitizeRichText(content: string) {
  return preserveEmptyParagraphSpacing(sanitizeHtml(content, createSanitizeOptions()));
}

export function RichTextRenderer({ content, className, style, unstyled }: RichTextRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clean = useMemo(() => sanitizeRichText(content), [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Collapsible "More" sections render as native <details> elements and
    // toggle themselves — no JavaScript needed, matching the standalone preview.

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-rt-image="true"]'));
    const cleanups: Array<() => void> = [];

    for (const image of images) {
      const markLoaded = () => {
        image.classList.remove("rt-inline-image--loading");
        image.classList.add("rt-inline-image--loaded");
      };

      if (image.complete && image.naturalWidth > 0) {
        markLoaded();
        continue;
      }

      image.classList.add("rt-inline-image--loading");
      image.classList.remove("rt-inline-image--loaded");

      const handleLoad = () => markLoaded();
      const handleError = () => markLoaded();

      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
      cleanups.push(() => {
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [clean]);

  const baseClass = unstyled ? "" : "prose dark:prose-invert max-w-none";

  return (
    <div
      ref={containerRef}
      className={`${baseClass} ${className ?? ""}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
