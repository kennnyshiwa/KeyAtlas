"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode, type CSSProperties } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Mention from "@tiptap/extension-mention";
import { FontSize } from "@/components/editor/extensions/font-size";
import { mentionSuggestion } from "@/components/editor/extensions/mention-suggestion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { contrastRatio, WCAG_AA_THRESHOLD, passesWcagAA } from "@/lib/color-contrast";
import { toast } from "sonner";
import "./rich-text-editor.css";

interface RichTextEditorProps {
  content?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  toolbarExtra?: ReactNode | ((ctx: { editor: Editor }) => ReactNode);
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

const DEFAULT_FONT_SIZE = "16";
const DEFAULT_COLOR = "#374151";

function normalizeGeekhackHtml(html: string) {
  return html
    // Convert <div align="..."> to <p> (Tiptap doesn't support div)
    .replace(/<div\s+align=["']([^"']+)["'][^>]*>/gi, '<p style="text-align:$1">')
    .replace(/<\/div>/gi, "</p>")
    // Convert bbc_size spans to inline font-size
    .replace(/<span[^>]*class=["'][^"']*bbc_size[^"']*["'][^>]*style=["'][^"']*font-size:\s*([^;"']+)[^"']*["'][^>]*>/gi,
      '<span style="font-size:$1">')
    // Convert bbc_color spans to inline color
    .replace(/<span[^>]*class=["'][^"']*bbc_color[^"']*["'][^>]*style=["'][^"']*color:\s*([^;"']+)[^"']*["'][^>]*>/gi,
      '<span style="color:$1">')
    // Strip remaining class attributes (bbc_ classes confuse Tiptap)
    .replace(/\s+class=["'][^"']*bbc_[^"']*["']/gi, "");
}

function normalizeLegacyFontTags(html: string) {
  return normalizeGeekhackHtml(html).replace(/<font([^>]*)>([\s\S]*?)<\/font>/gi, (_m, attrs, inner) => {
    const colorMatch = String(attrs).match(/color\s*=\s*["']?([^"'\s>]+)/i);
    const sizeMatch = String(attrs).match(/size\s*=\s*["']?([^"'\s>]+)/i);

    const sizeMap: Record<string, string> = {
      "1": "10px",
      "2": "13px",
      "3": "16px",
      "4": "18px",
      "5": "24px",
      "6": "32px",
      "7": "48px",
    };

    const styles: string[] = [];
    if (colorMatch?.[1]) styles.push(`color:${colorMatch[1]}`);
    if (sizeMatch?.[1]) {
      const s = sizeMatch[1];
      styles.push(`font-size:${sizeMap[s] || s}`);
    }

    return `<span style=\"${styles.join(";")}\">${inner}</span>`;
  });
}

function normalizeColorForPicker(value?: string | null) {
  if (!value) return DEFAULT_COLOR;
  const v = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
    return v.length === 4
      ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
      : v;
  }
  return DEFAULT_COLOR;
}

/**
 * Parse an rgb()/rgba() string to a hex colour.
 * Returns null on failure.
 */
function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const [, r, g, b, a] = m;
  // If fully transparent, return null so caller walks up the tree
  if (a !== undefined && parseFloat(a) === 0) return null;
  return (
    "#" +
    [r, g, b]
      .map((v) => Number(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Walk up the DOM tree to find the first ancestor with a non-transparent background */
function getEffectiveBgColor(el: HTMLElement): string {
  let current: HTMLElement | null = el;
  while (current) {
    const raw = getComputedStyle(current).backgroundColor;
    const hex = rgbToHex(raw);
    if (hex) return hex;
    current = current.parentElement;
  }
  // Ultimate fallback: check if dark mode is active
  if (document.documentElement.classList.contains("dark")) return "#0a0a0a";
  return "#ffffff";
}

async function uploadImageFile(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

function createImagePastePlugin(onUpload: (file: File, editor: Editor) => void) {
  return Extension.create({
    name: "imagePaste",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("imagePaste"),
          props: {
            handlePaste(_view, event) {
              const items = event.clipboardData?.items;
              if (!items) return false;
              for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) {
                    event.preventDefault();
                    onUpload(file, editor);
                    return true;
                  }
                }
              }
              return false;
            },
            handleDrop(_view, event) {
              const files = event.dataTransfer?.files;
              if (!files?.length) return false;
              for (const file of Array.from(files)) {
                if (file.type.startsWith("image/")) {
                  event.preventDefault();
                  onUpload(file, editor);
                  return true;
                }
              }
              return false;
            },
          },
        }),
      ];
    },
  });
}

export function RichTextEditor({
  content = "",
  onChange,
  placeholder = "Write something...",
  toolbarExtra,
  contentClassName,
  contentStyle,
}: RichTextEditorProps) {
  const [fontSizeInput, setFontSizeInput] = useState(DEFAULT_FONT_SIZE);
  const [colorInput, setColorInput] = useState(DEFAULT_COLOR);
  const [detectedBg, setDetectedBg] = useState("#ffffff");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const lastColorApplyAtRef = useRef(0);
  const normalizedContent = normalizeLegacyFontTags(content || "");
  const prevContentRef = useRef(normalizedContent);

  const handleImageUpload = useCallback(async (file: File, ed: Editor) => {
    // Insert a placeholder while uploading
    const placeholderSrc = URL.createObjectURL(file);
    ed.chain().focus().setImage({ src: placeholderSrc, alt: "Uploading..." }).run();

    const url = await uploadImageFile(file);
    URL.revokeObjectURL(placeholderSrc);

    if (url) {
      // Replace the blob placeholder with the real URL
      const { doc, tr } = ed.state;
      doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.src === placeholderSrc) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url, alt: null });
        }
      });
      if (tr.docChanged) {
        ed.view.dispatch(tr);
      } else {
        // Fallback: just append the image
        ed.chain().focus().setImage({ src: url }).run();
      }
    } else {
      // Remove the placeholder on failure
      const { doc, tr } = ed.state;
      doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.src === placeholderSrc) {
          tr.delete(pos, pos + node.nodeSize);
        }
      });
      if (tr.docChanged) ed.view.dispatch(tr);
      toast.error("Image upload failed");
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          loading: "lazy",
          decoding: "async",
        },
      }),
      createImagePastePlugin(handleImageUpload),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: mentionSuggestion,
        renderHTML({ options, node }) {
          return [
            "a",
            {
              class: options.HTMLAttributes.class,
              href: `/users/${node.attrs.id}`,
              "data-mention": node.attrs.id,
            },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: normalizedContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (to > from) {
        lastSelectionRef.current = { from, to };
      }
    },
  });

  // Sync external content changes (e.g. from Geekhack import) into the editor
  useEffect(() => {
    if (!editor) return;
    if (normalizedContent !== prevContentRef.current) {
      prevContentRef.current = normalizedContent;
      // Only update if meaningfully different from current editor content
      const currentHtml = editor.getHTML();
      if (normalizedContent !== currentHtml) {
        editor.commands.setContent(normalizedContent, { emitUpdate: false });
      }
    }
  }, [editor, normalizedContent]);

  useEffect(() => {
    if (!editor) return;

    const syncToolbarState = () => {
      const attrs = editor.getAttributes("textStyle");

      const activeSize = typeof attrs.fontSize === "string" ? attrs.fontSize : "";
      const normalizedSize = activeSize.endsWith("px") ? activeSize.slice(0, -2) : "";
      setFontSizeInput(normalizedSize || DEFAULT_FONT_SIZE);

      const activeColor = typeof attrs.color === "string" ? attrs.color : "";
      setColorInput(normalizeColorForPicker(activeColor));
    };

    syncToolbarState();
    editor.on("selectionUpdate", syncToolbarState);
    editor.on("transaction", syncToolbarState);

    return () => {
      editor.off("selectionUpdate", syncToolbarState);
      editor.off("transaction", syncToolbarState);
    };
  }, [editor]);

  // Detect the actual computed background colour of the editor content area
  // so the contrast guard works in both light and dark mode.
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;

    const readBg = () => {
      setDetectedBg(getEffectiveBgColor(el));
    };

    readBg();

    // Re-read when the theme changes (class on <html> toggles dark mode)
    const observer = new MutationObserver(readBg);
    const root = document.documentElement;
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    // Also listen for system-level theme changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", readBg);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", readBg);
    };
  }, []);

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const applyToSelectionOrCursor = (apply: (chain: any) => any) => {
    const { from, to } = editor.state.selection;
    const hasActiveSelection = to > from;

    if (hasActiveSelection) {
      apply(editor.chain().focus()).run();
      return;
    }

    const remembered = lastSelectionRef.current;
    if (remembered && remembered.to > remembered.from) {
      apply(editor.chain().focus().setTextSelection(remembered)).run();
      return;
    }

    apply(editor.chain().focus()).run();
  };

  const applyFontSize = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(48, Math.max(10, Math.round(parsed)));
    const next = `${clamped}px`;
    setFontSizeInput(String(clamped));
    applyToSelectionOrCursor((chain) => chain.setFontSize(next));
  };

  const applyColor = (value: string) => {
    applyToSelectionOrCursor((chain) => chain.setColor(value));
  };

  return (
    <div className="border-input rounded-md border">
      <div className="bg-muted/50 flex flex-wrap gap-1 border-b p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active={editor.isActive("bold") || undefined}
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active={editor.isActive("italic") || undefined}
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          data-active={editor.isActive("heading", { level: 1 }) || undefined}
          aria-label="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          data-active={editor.isActive("heading", { level: 2 }) || undefined}
          aria-label="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          data-active={editor.isActive("heading", { level: 3 }) || undefined}
          aria-label="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-active={editor.isActive("bulletList") || undefined}
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          data-active={editor.isActive("orderedList") || undefined}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          data-active={editor.isActive("blockquote") || undefined}
          aria-label="Blockquote"
        >
          <Quote className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={setLink}
          data-active={editor.isActive("link") || undefined}
          aria-label="Link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <Select
          value={editor.isActive({ textAlign: "center" }) ? "center" : editor.isActive({ textAlign: "right" }) ? "right" : "left"}
          onValueChange={(v) => editor.chain().focus().setTextAlign(v).run()}
        >
          <SelectTrigger className="h-8 w-28 text-xs" aria-label="Text align">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Align: Left</SelectItem>
            <SelectItem value="center">Align: Center</SelectItem>
            <SelectItem value="right">Align: Right</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <input
            data-testid="rte-font-size-input"
            type="number"
            min={10}
            max={48}
            value={fontSizeInput}
            onChange={(e) => {
              setFontSizeInput(e.target.value);
            }}
            onBlur={() => applyFontSize(fontSizeInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFontSize(fontSizeInput);
              }
            }}
            className="border-input bg-background h-8 w-20 rounded-md border px-2 text-xs"
            aria-label="Font size in pixels"
          />
          <Button
            data-testid="rte-font-size-apply"
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFontSize(fontSizeInput)}
          >
            Size
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <input
            data-testid="rte-color-input"
            type="color"
            value={colorInput}
            onChange={(e) => {
              const next = e.target.value;
              setColorInput(next);
              const now = Date.now();
              if (now - lastColorApplyAtRef.current > 120) {
                lastColorApplyAtRef.current = now;
                applyColor(next);
              }
            }}
            onBlur={() => applyColor(colorInput)}
            className="border-input h-8 w-9 cursor-pointer rounded border p-1"
            aria-label="Text color"
          />
          <input
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            onBlur={() => {
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorInput)) {
                applyColor(colorInput);
              }
            }}
            placeholder="#374151"
            className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs"
            aria-label="Hex text color"
          />
        </div>

        {/* Contrast guard */}
        {(() => {
          const ratio = contrastRatio(colorInput, detectedBg);
          const passes = ratio != null && ratio >= WCAG_AA_THRESHOLD;
          if (ratio != null && !passes) {
            return (
              <div
                data-testid="contrast-warning"
                className="flex items-center gap-1 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                role="status"
              >
                <span>⚠ Low contrast ({ratio.toFixed(1)}:1)</span>
                <button
                  type="button"
                  data-testid="contrast-reset"
                  className="ml-1 underline hover:no-underline"
                  onClick={() => {
                    setColorInput(DEFAULT_COLOR);
                    applyColor(DEFAULT_COLOR);
                  }}
                >
                  Reset
                </button>
              </div>
            );
          }
          return null;
        })()}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label="Undo"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label="Redo"
        >
          <Redo className="h-4 w-4" />
        </Button>

        {toolbarExtra && (
          <div className="ml-auto flex flex-wrap items-center gap-2 border-l pl-2">
            {typeof toolbarExtra === "function" ? toolbarExtra({ editor }) : toolbarExtra}
          </div>
        )}
      </div>
      <div ref={editorContainerRef} className={`prose dark:prose-invert max-w-none w-full px-3 py-2 [&_.ProseMirror]:max-w-none ${contentClassName ?? ""}`.trim()} style={contentStyle}>
        <EditorContent editor={editor} data-testid="rich-text-editor-content" />
      </div>
    </div>
  );
}
