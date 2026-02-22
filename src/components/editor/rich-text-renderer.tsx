import sanitizeHtml from "sanitize-html";
import type { CSSProperties } from "react";

interface RichTextRendererProps {
  content: string;
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
}

const sanitizeOptions: sanitizeHtml.IOptions = {
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
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    span: ["style"],
    li: ["style"],
    blockquote: ["style"],
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/],
      "font-size": [/^\d+(?:\.\d+)?px$/],
      "text-align": [/^(left|center|right)$/],
    },
  },
  allowedSchemes: ["http", "https"],
};

export function RichTextRenderer({ content, className, style, unstyled }: RichTextRendererProps) {
  const clean = sanitizeHtml(content, sanitizeOptions);

  const baseClass = unstyled ? "" : "prose dark:prose-invert max-w-none";

  return (
    <div
      className={`${baseClass} ${className ?? ""}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
