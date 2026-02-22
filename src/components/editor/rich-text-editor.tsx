"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize } from "@/components/editor/extensions/font-size";
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
import "./rich-text-editor.css";

interface RichTextEditorProps {
  content?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  toolbarExtra?: ReactNode | ((ctx: { editor: ReturnType<typeof useEditor> }) => ReactNode);
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

const DEFAULT_FONT_SIZE = "16";
const DEFAULT_COLOR = "#374151";

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
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const lastColorApplyAtRef = useRef(0);

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
      Placeholder.configure({ placeholder }),
    ],
    content,
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

  useEffect(() => {
    if (!editor) return;

    const syncToolbarState = () => {
      const attrs = editor.getAttributes("textStyle");

      const activeSize = typeof attrs.fontSize === "string" ? attrs.fontSize : "";
      const normalizedSize = activeSize.endsWith("px") ? activeSize.slice(0, -2) : "";
      setFontSizeInput(normalizedSize || DEFAULT_FONT_SIZE);

      const activeColor = typeof attrs.color === "string" ? attrs.color : "";
      setColorInput(activeColor || DEFAULT_COLOR);
    };

    syncToolbarState();
    editor.on("selectionUpdate", syncToolbarState);
    editor.on("transaction", syncToolbarState);

    return () => {
      editor.off("selectionUpdate", syncToolbarState);
      editor.off("transaction", syncToolbarState);
    };
  }, [editor]);

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
              const next = e.target.value;
              setFontSizeInput(next);
              if (/^\d{1,2}$/.test(next)) {
                applyFontSize(next);
              }
            }}
            onBlur={() => applyFontSize(fontSizeInput)}
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
      <div className={`prose dark:prose-invert max-w-none px-3 py-2 ${contentClassName ?? ""}`.trim()} style={contentStyle}>
        <EditorContent editor={editor} data-testid="rich-text-editor-content" />
      </div>
    </div>
  );
}
