"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

function htmlToBbcode(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "[b]$2[/b]")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "[i]$2[/i]")
    .replace(/<u>([\s\S]*?)<\/u>/gi, "[u]$1[/u]")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[url=$1]$2[/url]")
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, "[img]$1[/img]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildGeekhackBbcode(title: string, shareUrl: string, payload?: GeekhackSharePayload): string {
  const lines: string[] = [];
  lines.push(`[size=18pt][b]${title}[/b][/size]`);

  if (payload?.status) lines.push(`[b]Status:[/b] ${payload.status.replace(/_/g, " ")}`);
  if (payload?.designer) lines.push(`[b]Designer:[/b] ${payload.designer}`);

  lines.push("", `[url=${shareUrl}]KeyAtlas Project Page[/url]`, "");

  if (payload?.descriptionHtml) {
    lines.push("[b]Description[/b]");
    lines.push(htmlToBbcode(payload.descriptionHtml), "");
  }

  if (payload?.images?.length) {
    lines.push("[b]Images[/b]");
    for (const image of payload.images.slice(0, 20)) {
      lines.push(`[img]${image.url}[/img]`);
    }
    lines.push("");
  }

  if (payload?.links?.length) {
    lines.push("[b]Links[/b]");
    for (const link of payload.links) {
      lines.push(`- [url=${link.url}]${link.label}[/url]`);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

interface GeekhackSharePayload {
  status?: string;
  designer?: string | null;
  descriptionHtml?: string | null;
  images?: Array<{ url: string; alt?: string | null }>;
  links?: Array<{ label: string; url: string }>;
}

interface ShareButtonProps {
  title: string;
  url?: string;
  geekhack?: GeekhackSharePayload;
}

export function ShareButton({ title, url, geekhack }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copiedGeekhack, setCopiedGeekhack] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  const shareLinks = [
    {
      name: "Twitter / X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: "Reddit",
      href: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`,
    },
    {
      name: "Discord",
      action: () => copyLink(),
      label: "Copy for Discord",
    },
  ];

  async function copyText(text: string) {
    // Primary path
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy path
      }
    }

    // Legacy fallback for browsers with restricted Clipboard API
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copyLink() {
    const ok = await copyText(shareUrl);
    if (!ok) {
      toast.error("Could not copy link. Your browser blocked clipboard access.");
      return;
    }
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyGeekhackBbcode() {
    const bbcode = buildGeekhackBbcode(title, shareUrl, geekhack);
    const ok = await copyText(bbcode);
    if (!ok) {
      toast.error("Could not copy Geekhack BBCode. Browser clipboard permission is blocked.");
      return;
    }
    setCopiedGeekhack(true);
    toast.success("Geekhack BBCode copied!");
    setTimeout(() => setCopiedGeekhack(false), 2000);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        {shareLinks.map((link) =>
          link.href ? (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors"
            >
              {link.name}
            </a>
          ) : (
            <button
              key={link.name}
              onClick={link.action}
              className="hover:bg-muted flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors"
            >
              {link.label || link.name}
            </button>
          )
        )}
        {geekhack && (
          <button
            onClick={copyGeekhackBbcode}
            className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
          >
            {copiedGeekhack ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy for Geekhack
          </button>
        )}
        <div className="my-1 border-t" />
        <button
          onClick={copyLink}
          className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          Copy Link
        </button>
      </PopoverContent>
    </Popover>
  );
}
