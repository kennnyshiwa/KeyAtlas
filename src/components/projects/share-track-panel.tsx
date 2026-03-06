"use client";

import { useMemo, useState } from "react";
import type { ProjectStatus } from "@/generated/prisma/client";
import { STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, Megaphone } from "lucide-react";
import { toast } from "sonner";

type SharePreset = "discord" | "reddit" | "x" | "custom";

interface ShareTrackPanelProps {
  title: string;
  slug: string;
  status: ProjectStatus;
  followerCount: number;
  favoriteCount: number;
  commentCount: number;
  isCreator: boolean;
}

function normalizeRefLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function buildProjectUrl(slug: string): URL {
  if (typeof window !== "undefined") {
    return new URL(`/projects/${slug}`, window.location.origin);
  }
  return new URL(`https://keyatlas.io/projects/${slug}`);
}

function buildShareMessage({
  title,
  status,
  followerCount,
  favoriteCount,
  commentCount,
  url,
  channel,
}: {
  title: string;
  status: ProjectStatus;
  followerCount: number;
  favoriteCount: number;
  commentCount: number;
  url: string;
  channel: "discord" | "reddit";
}): string {
  const statusLabel = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const socialProof = `${followerCount} followers • ${favoriteCount} bookmarks • ${commentCount} comments`;

  if (channel === "reddit") {
    return [
      `${title} — ${statusLabel}`,
      `Social proof: ${socialProof}`,
      `Take a look + follow updates: ${url}`,
    ].join("\n");
  }

  return [
    `**${title}** (${statusLabel})`,
    `${socialProof}`,
    `Track updates on KeyAtlas: ${url}`,
  ].join("\n");
}

function buildUpdateCard({
  title,
  status,
  followerCount,
  favoriteCount,
  commentCount,
  url,
}: {
  title: string;
  status: ProjectStatus;
  followerCount: number;
  favoriteCount: number;
  commentCount: number;
  url: string;
}): string {
  const statusLabel = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const statusLine =
    status === "SHIPPING"
      ? "🚚 Now shipping"
      : status === "GROUP_BUY"
        ? "🛒 Group buy is live"
        : `📌 Current status: ${statusLabel}`;

  return [
    `[${statusLabel}] ${title}`,
    statusLine,
    `Community: ${followerCount} followers · ${favoriteCount} bookmarks · ${commentCount} comments`,
    `Follow + updates: ${url}`,
  ].join("\n");
}

export function ShareTrackPanel({
  title,
  slug,
  status,
  followerCount,
  favoriteCount,
  commentCount,
  isCreator,
}: ShareTrackPanelProps) {
  const [preset, setPreset] = useState<SharePreset>("discord");
  const [customRef, setCustomRef] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const refLabel = useMemo(() => {
    if (preset === "custom") {
      const normalized = normalizeRefLabel(customRef);
      return normalized || "custom";
    }
    return preset;
  }, [customRef, preset]);

  const shareUrl = useMemo(() => {
    const url = buildProjectUrl(slug);
    url.searchParams.set("ref", refLabel);

    if (preset !== "custom") {
      url.searchParams.set("utm_source", preset);
      url.searchParams.set("utm_campaign", "project_share");
    }

    return url.toString();
  }, [preset, refLabel, slug]);

  const discordMessage = useMemo(
    () =>
      buildShareMessage({
        title,
        status,
        followerCount,
        favoriteCount,
        commentCount,
        url: shareUrl,
        channel: "discord",
      }),
    [commentCount, favoriteCount, followerCount, shareUrl, status, title]
  );

  const redditMessage = useMemo(
    () =>
      buildShareMessage({
        title,
        status,
        followerCount,
        favoriteCount,
        commentCount,
        url: shareUrl,
        channel: "reddit",
      }),
    [commentCount, favoriteCount, followerCount, shareUrl, status, title]
  );

  const updateCard = useMemo(
    () =>
      buildUpdateCard({
        title,
        status,
        followerCount,
        favoriteCount,
        commentCount,
        url: shareUrl,
      }),
    [commentCount, favoriteCount, followerCount, shareUrl, status, title]
  );

  async function copyText(text: string, key: string, label: string) {
    const write = async () => {
      await navigator.clipboard.writeText(text);
      return true;
    };

    try {
      if (navigator.clipboard) {
        await write();
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
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
        if (!ok) throw new Error("Legacy copy failed");
      } catch {
        toast.error("Could not copy. Your browser blocked clipboard access.");
        return;
      }
    }

    setCopiedKey(key);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4" />
          Share &amp; Track
        </CardTitle>
        <CardDescription>
          Generate source-tagged links and ready-to-post messages for Discord, Reddit, and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Referral source</Label>
          <div className="flex flex-wrap gap-2">
            {(["discord", "reddit", "x", "custom"] as SharePreset[]).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={preset === option ? "default" : "outline"}
                onClick={() => setPreset(option)}
              >
                {option === "x" ? "X" : option.charAt(0).toUpperCase() + option.slice(1)}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <Input
              value={customRef}
              onChange={(event) => setCustomRef(event.target.value)}
              placeholder="e.g. keyboardclub-discord"
              maxLength={40}
            />
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm break-all">{shareUrl}</div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copyText(shareUrl, "link", "Link")}>
            {copiedKey === "link" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            Copy link
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyText(discordMessage, "discord", "Discord message")}>
            {copiedKey === "discord" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            Copy Discord message
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyText(redditMessage, "reddit", "Reddit message")}>
            {copiedKey === "reddit" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            Copy Reddit message
          </Button>
          {isCreator && (
            <Button variant="secondary" size="sm" onClick={() => copyText(updateCard, "update-card", "Update card")}>
              {copiedKey === "update-card" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy update card
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
