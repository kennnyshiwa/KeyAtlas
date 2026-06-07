"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { Extension } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Mention from "@tiptap/extension-mention";
import { normalizeCollapsibleSections } from "@/components/editor/collapsible-html";
import { CollapsibleSection } from "@/components/editor/extensions/collapsible-section";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { contrastRatio, WCAG_AA_THRESHOLD } from "@/lib/color-contrast";
import { toast } from "sonner";
import "./rich-text-editor.css";

interface RichTextEditorProps {
  content?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  toolbarExtra?: ReactNode | ((ctx: { editor: Editor }) => ReactNode);
  contentClassName?: string;
  contentStyle?: CSSProperties;
  stickyToolbar?: boolean;
  showEnterModeToggle?: boolean;
  initialEnterMode?: "paragraph" | "lineBreak";
}

const DEFAULT_FONT_SIZE = "16";
const DEFAULT_COLOR = "#374151";

/** Wraps a toolbar control in a styled hover/focus tooltip describing what it does. */
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function createCollapsibleSectionHtml(innerHtml: string, { summary = "More", open = false } = {}) {
  const content = innerHtml.trim() || "<p></p>";
  return `<details data-collapsible="true"${open ? " open" : ""}><summary>${summary}</summary><div data-collapsible-content="true">${content}</div></details>`;
}

function getSelectionHtml(editor: Editor, range?: { from: number; to: number }) {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const wrapper = document.createElement("div");
  const slice = range
    ? editor.state.doc.slice(range.from, range.to)
    : editor.state.selection.content();
  wrapper.appendChild(serializer.serializeFragment(slice.content));
  return wrapper.innerHTML;
}

function normalizeGeekhackHtml(html: string) {
  let normalized = html;

  if (typeof DOMParser !== "undefined" && html.includes("<div")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    for (const div of Array.from(doc.body.querySelectorAll<HTMLDivElement>("div[align]"))) {
      const paragraph = doc.createElement("p");
      paragraph.style.textAlign = div.getAttribute("align") || "left";

      while (div.firstChild) {
        paragraph.appendChild(div.firstChild);
      }

      div.replaceWith(paragraph);
    }

    normalized = doc.body.innerHTML;
  } else {
    normalized = normalized.replace(/<div\s+align=["']([^"']+)["'][^>]*>/gi, '<p style="text-align:$1">');
  }

  return normalized
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
  stickyToolbar = false,
  showEnterModeToggle = false,
  initialEnterMode = "paragraph",
}: RichTextEditorProps) {
  const [fontSizeInput, setFontSizeInput] = useState(DEFAULT_FONT_SIZE);
  const [colorInput, setColorInput] = useState(DEFAULT_COLOR);
  const [detectedBg, setDetectedBg] = useState("#ffffff");
  const [enterMode, setEnterMode] = useState<"paragraph" | "lineBreak">(initialEnterMode);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const lastColorApplyAtRef = useRef(0);
  const normalizedContent = normalizeCollapsibleSections(normalizeLegacyFontTags(content || ""));
  const lastEmittedHtmlRef = useRef(normalizedContent);
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
      CollapsibleSection,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph", "collapsibleSection"] }),
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
      const html = editor.getHTML();
      lastEmittedHtmlRef.current = html;
      onChange(html);
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
      if (normalizedContent === lastEmittedHtmlRef.current) {
        return;
      }
      // Only update if meaningfully different from current editor content
      const currentHtml = editor.getHTML();
      if (normalizedContent !== currentHtml) {
        editor.commands.setContent(normalizedContent, { emitUpdate: false });
        lastEmittedHtmlRef.current = normalizedContent;
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

  const applyToSelectionOrCursor = (apply: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
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

  const handleEditorKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      enterMode !== "lineBreak" ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    editor.chain().focus().setHardBreak().run();
  };

  // Remove the collapsible section the cursor is in, lifting its content back
  // into the document (an easy way to "undo" a More section later). Returns
  // false when the selection isn't inside a section.
  const removeCollapsibleSection = () => {
    const { state } = editor;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "collapsibleSection") {
        const from = $from.before(depth);
        const to = $from.after(depth);
        editor.view.dispatch(state.tr.replaceWith(from, to, node.content).scrollIntoView());
        editor.commands.focus();
        return true;
      }
    }
    return false;
  };

  const insertCollapsibleSection = () => {
    // If the cursor is already inside a section, the button instead REMOVES it,
    // restoring the hidden content to the normal document flow.
    if (editor.isActive("collapsibleSection")) {
      removeCollapsibleSection();
      return;
    }

    // Use only the *live* selection. The toolbar button preserves it via
    // onMouseDown preventDefault, so a genuine highlight still reads as
    // non-empty here. We deliberately do NOT fall back to a remembered
    // selection, which could silently wrap the entire document.
    const { from, to, empty } = editor.state.selection;

    // No selection: drop in an empty, expanded section the user can type into.
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent(createCollapsibleSectionHtml("", { open: true }))
        .run();
      return;
    }

    // Selection: wrap the highlighted content in an expanded section so it's
    // immediately visible (and the pill is clickable to collapse it).
    const selectedHtml = getSelectionHtml(editor, { from, to });
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, createCollapsibleSectionHtml(selectedHtml, { open: true }))
      .run();
  };

  return (
    <div className="border-input rounded-md border">
      <TooltipProvider delayDuration={300}>
      <div
        className={`bg-muted/95 flex flex-wrap gap-1 border-b p-1 ${stickyToolbar ? "sticky top-20 z-20 rounded-t-md backdrop-blur supports-[backdrop-filter]:bg-background/80" : ""}`.trim()}
      >
        <Tip label="Bold (⌘/Ctrl+B)">
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
        </Tip>
        <Tip label="Italic (⌘/Ctrl+I)">
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
        </Tip>
        <Tip label="Big heading">
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
        </Tip>
        <Tip label="Medium heading">
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
        </Tip>
        <Tip label="Small heading">
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
        </Tip>
        <Tip label="Bulleted list">
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
        </Tip>
        <Tip label="Numbered list">
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
        </Tip>
        <Tip label="Quote block">
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
        </Tip>
        <Tip label="Insert link">
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
        </Tip>
        <Tip
          label={
            editor.isActive("collapsibleSection")
              ? "Remove this spoiler — its content stays in place"
              : "Spoiler: hide the selected text behind a click-to-reveal “More” button"
          }
        >
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertCollapsibleSection}
            data-active={editor.isActive("collapsibleSection") || undefined}
            aria-label={
              editor.isActive("collapsibleSection")
                ? "Remove this spoiler section (keep its content)"
                : "Hide the selection in a spoiler section"
            }
          >
            {editor.isActive("collapsibleSection") ? "Remove spoiler" : "Spoiler"}
          </Button>
        </Tip>
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

        <Tip label="Font size in pixels (10–48) — type a number, then Enter or Size">
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
        </Tip>

        <Tip label="Text colour — pick a swatch or enter a hex code">
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
        </Tip>

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

        <Tip label="Undo (⌘/Ctrl+Z)">
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
        </Tip>
        <Tip label="Redo (⌘/Ctrl+Shift+Z)">
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
        </Tip>

        {showEnterModeToggle && (
          <Tip
            label={
              enterMode === "lineBreak"
                ? "Enter inserts a tight line break (Shift+Enter also works). Click for normal paragraph spacing."
                : "Enter starts a new paragraph with normal spacing. Click for tight line breaks."
            }
          >
            <Button
              type="button"
              variant={enterMode === "lineBreak" ? "secondary" : "outline"}
              className="h-8 px-2 text-xs"
              onClick={() => setEnterMode((current) => (current === "lineBreak" ? "paragraph" : "lineBreak"))}
            >
              {enterMode === "lineBreak" ? "Tight enter" : "Normal enter"}
            </Button>
          </Tip>
        )}

        {toolbarExtra && (
          <div className="ml-auto flex flex-wrap items-center gap-2 border-l pl-2">
            {typeof toolbarExtra === "function" ? toolbarExtra({ editor }) : toolbarExtra}
          </div>
        )}
      </div>
      </TooltipProvider>
      <div
        ref={editorContainerRef}
        onKeyDownCapture={handleEditorKeyDownCapture}
        className={`prose dark:prose-invert max-w-none w-full px-3 py-2 [&_.ProseMirror]:max-w-none ${contentClassName ?? ""}`.trim()}
        style={contentStyle}
      >
        <EditorContent editor={editor} data-testid="rich-text-editor-content" />
      </div>
    </div>
  );
}
