import sanitizeHtml from "sanitize-html";

interface RichTextRendererProps {
  content: string;
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
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https"],
};

export function RichTextRenderer({ content }: RichTextRendererProps) {
  const clean = sanitizeHtml(content, sanitizeOptions);

  return (
    <div
      className="prose dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
