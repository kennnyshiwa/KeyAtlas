import sanitizeHtml from "sanitize-html";
import type { CSSProperties } from "react";

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
    "div",
    "figure",
    "figcaption",
    "img",
    "font",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    div: ["style", "align", "class"],
    span: ["style"],
    li: ["style"],
    blockquote: ["style"],
    strong: ["style"],
    em: ["style"],
    figure: ["style", "class"],
    figcaption: ["style", "class"],
    img: ["src", "alt", "loading", "decoding", "width", "height", "style", "class"],
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
    font: (tagName, attribs) => {
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
