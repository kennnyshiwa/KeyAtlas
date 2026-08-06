"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

function buildTrackedUrl(baseUrl: string, ref: string): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}ref=${encodeURIComponent(ref)}`;
  }
}

interface ShareButtonProps {
  title: string;
  url?: string;
  geekhack?: {
    status?: string;
    designer?: string | null;
    descriptionHtml?: string | null;
    images?: Array<{ url: string; alt?: string | null }>;
    links?: Array<{ label: string; url: string }>;
  };
}

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

function buildGeekhackBbcode(title: string, shareUrl: string, geekhack?: ShareButtonProps["geekhack"]) {
  const lines: string[] = [`[size=18pt][b]${title}[/b][/size]`];

  if (geekhack?.status) lines.push(`[b]Status:[/b] ${geekhack.status.replace(/_/g, " ")}`);
  if (geekhack?.designer) lines.push(`[b]Designer:[/b] ${geekhack.designer}`);

  lines.push("", `[url=${shareUrl}]KeyAtlas Project Page[/url]`, "");

  if (geekhack?.descriptionHtml) {
    lines.push("[b]Description[/b]");
    lines.push(htmlToBbcode(geekhack.descriptionHtml), "");
  }

  if (geekhack?.images?.length) {
    lines.push("[b]Images[/b]");
    for (const image of geekhack.images.slice(0, 20)) {
      lines.push(`[img]${image.url}[/img]`);
    }
    lines.push("");
  }

  if (geekhack?.links?.length) {
    lines.push("[b]Links[/b]");
    for (const link of geekhack.links) {
      lines.push(`- [url=${link.url}]${link.label}[/url]`);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ShareButton({ title, url, geekhack }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copiedGeekhack, setCopiedGeekhack] = useState(false);

  const baseUrl = url || (typeof window !== "undefined" ? window.location.href.split("?")[0] : "");

  async function copyText(text: string) {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through
      }
    }

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

  async function handleShare() {
    const trackedUrl = buildTrackedUrl(baseUrl, "web_share");

    if (navigator.share) {
      try {
        await navigator.share({ title, url: trackedUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    const ok = await copyText(trackedUrl);
    if (!ok) {
      toast.error("Could not share or copy the link.");
      return;
    }

    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyTrackedLink() {
    const trackedUrl = buildTrackedUrl(baseUrl, "web_share");
    const ok = await copyText(trackedUrl);
    if (!ok) {
      toast.error("Could not copy the link.");
      return;
    }

    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyGeekhackBbcode() {
    const trackedUrl = buildTrackedUrl(baseUrl, "web_share");
    const bbcode = buildGeekhackBbcode(title, trackedUrl, geekhack);
    const ok = await copyText(bbcode);
    if (!ok) {
      toast.error("Could not copy Geekhack BBCode.");
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
        <button
          onClick={handleShare}
          className="hover:bg-muted flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          Share...
        </button>
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
          onClick={copyTrackedLink}
          className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          Copy Link
        </button>
      </PopoverContent>
    </Popover>
  );
}
