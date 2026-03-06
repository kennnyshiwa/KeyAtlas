"use client";

import { useEffect, useState } from "react";
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

function buildTrackedUrl(baseUrl: string, ref: string): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    // fallback — just append
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}ref=${encodeURIComponent(ref)}`;
  }
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

interface ReferralStats {
  total: number;
  bySource: { ref: string; count: number }[];
  byDay: { date: string; count: number }[];
}

interface ShareButtonProps {
  title: string;
  url?: string;
  slug?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  geekhack?: GeekhackSharePayload;
}

export function ShareButton({ title, url, slug, isCreator, isAdmin, geekhack }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copiedGeekhack, setCopiedGeekhack] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsFetched, setStatsFetched] = useState(false);

  const baseUrl = url || (typeof window !== "undefined" ? window.location.href.split("?")[0] : "");
  const showStats = (isCreator || isAdmin) && !!slug;

  // Lazy-fetch stats when popover opens (only for creator/admin)
  useEffect(() => {
    if (!popoverOpen || !showStats || statsFetched) return;
    setStatsLoading(true);
    setStatsFetched(true);
    fetch(`/api/v1/projects/${slug}/referral/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReferralStats | null) => setStats(data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [popoverOpen, showStats, slug, statsFetched]);

  const shareLinks = [
    {
      name: "Twitter / X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(buildTrackedUrl(baseUrl, "x"))}`,
    },
    {
      name: "Reddit",
      href: `https://reddit.com/submit?url=${encodeURIComponent(buildTrackedUrl(baseUrl, "reddit"))}&title=${encodeURIComponent(title)}`,
    },
    {
      name: "Discord",
      action: () => copyTracked("discord", "Discord link"),
      label: "Copy for Discord",
    },
  ];

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

  async function copyTracked(ref: string, label: string) {
    const tracked = buildTrackedUrl(baseUrl, ref);
    const ok = await copyText(tracked);
    if (!ok) {
      toast.error("Could not copy. Your browser blocked clipboard access.");
      return;
    }
    setCopied(true);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyGeekhackBbcode() {
    const trackedUrl = buildTrackedUrl(baseUrl, "geekhack");
    const bbcode = buildGeekhackBbcode(title, trackedUrl, geekhack);
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
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
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
          onClick={() => copyTracked("link", "Link")}
          className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          Copy Link
        </button>

        {showStats && (
          <>
            <div className="my-1 border-t" />
            <div className="px-2 py-1.5 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-xs">Referral Stats</p>
              {statsLoading && <p>Loading…</p>}
              {stats && stats.total === 0 && <p>No clicks yet.</p>}
              {stats && stats.total > 0 && (
                <>
                  <p>{stats.total} total click{stats.total !== 1 ? "s" : ""}</p>
                  {stats.bySource.length > 0 && (
                    <p>
                      {stats.bySource
                        .slice(0, 5)
                        .map((s) => `${s.ref}: ${s.count}`)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
              {!statsLoading && !stats && statsFetched && <p>Could not load stats.</p>}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
