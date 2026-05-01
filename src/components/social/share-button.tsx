"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Share2 } from "lucide-react";
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
}

export function ShareButton({ title, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

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

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      {copied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
      Share
    </Button>
  );
}
